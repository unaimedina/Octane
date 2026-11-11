import { randomBytes } from "node:crypto";
import { getFileContent, getFileTree } from "./oc-server";
import {
  parsePlanFile,
  parsePlanIndex,
  planTaskPrompt,
  type PlanIndexRow,
  type PlanIndexStatus,
  type PlanPriority,
} from "./plan-files";
import { getSession } from "./session-service";
import { validateDependencies } from "./task-graph";
import { listTasks, mutateTasks, TaskValidationError } from "./tasks";
import type { Task, TaskPriority, TaskStatus } from "./types";
import { apiFlavor } from "./upstream";

const PLAN_DIRS = ["plans", "advisor-plans"];
const PLAN_FILE = /^\d{3}-.+\.md$/;
const MAX_PLAN_FILES = 100;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_TITLE = 500;

export type PlanFilePreviewItem = {
  ref: string;
  number: string;
  title: string;
  priority?: PlanPriority;
  dependsOn: string[];
  status: PlanIndexStatus;
  imported: boolean;
};

export type PlanFilePreview = {
  plansDir: string | null;
  items: PlanFilePreviewItem[];
  warnings: string[];
};

export type PlanFileImportResult = {
  added: number;
  updated: number;
  skipped: number;
  warnings: string[];
  tasks: Task[];
};

type LoadedPlan = {
  ref: string;
  fileName: string;
  absolute: string;
  number: string;
  title: string;
  why: string;
  priority?: PlanPriority;
  dependsOn: string[];
  status: PlanIndexStatus;
};

type Loaded = { plansDir: string | null; plans: LoadedPlan[]; warnings: string[] };

type TreeEntry = { name: string; path: string; absolute: string };

function normalize(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

async function findPlansDir(
  sessionDirectory: string,
): Promise<{ dirName: string; files: TreeEntry[]; index?: TreeEntry } | null> {
  const base = normalize(sessionDirectory);
  if (!base) return null;
  for (const dirName of PLAN_DIRS) {
    const entries = await getFileTree(`${base}/${dirName}`);
    const files = entries.filter(
      (entry) => entry.type === "file" && PLAN_FILE.test(entry.name),
    );
    if (files.length === 0) continue;
    return {
      dirName,
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
      index: entries.find(
        (entry) => entry.type === "file" && entry.name.toLowerCase() === "readme.md",
      ),
    };
  }
  return null;
}

/** Read a text file through OpenCode, retrying with the tree's `path` field. */
async function readText(entry: TreeEntry): Promise<string | null> {
  for (const candidate of [entry.absolute, entry.path]) {
    if (!candidate) continue;
    const content = await getFileContent(candidate);
    if (content && content.type === "text" && typeof content.content === "string") {
      return content.content;
    }
  }
  return null;
}

async function loadPlans(subject: string, sessionID: string): Promise<Loaded> {
  void subject;
  const warnings: string[] = [];
  // The v1 API lists paths relative to the project root only, so an arbitrary
  // session folder cannot be mapped. Plan files are unavailable there.
  if ((await apiFlavor()) === "v1") return { plansDir: null, plans: [], warnings };

  const session = await getSession(sessionID);
  const found = await findPlansDir(session.directory ?? "");
  if (!found) return { plansDir: null, plans: [], warnings };

  const index = new Map<string, PlanIndexRow>();
  if (found.index) {
    const text = await readText(found.index);
    if (text) for (const row of parsePlanIndex(text)) index.set(row.number, row);
    else warnings.push(`Could not read ${found.dirName}/${found.index.name}.`);
  }

  let files = found.files;
  if (files.length > MAX_PLAN_FILES) {
    warnings.push(`Only the first ${MAX_PLAN_FILES} plan files are read.`);
    files = files.slice(0, MAX_PLAN_FILES);
  }

  const plans: LoadedPlan[] = [];
  for (const entry of files) {
    const text = await readText(entry);
    if (text === null) {
      warnings.push(`Could not read ${found.dirName}/${entry.name}; skipped.`);
      continue;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
      warnings.push(`${found.dirName}/${entry.name} is larger than 200 KB; skipped.`);
      continue;
    }
    const fileNumber = entry.name.slice(0, 3);
    const info = parsePlanFile(text, fileNumber);
    const row = index.get(info.number);
    const dependsOn = [...info.dependsOn];
    for (const dependency of row?.dependsOn ?? []) {
      if (!dependsOn.includes(dependency)) dependsOn.push(dependency);
    }
    plans.push({
      ref: `${found.dirName}/${entry.name}`,
      fileName: entry.name,
      absolute: entry.absolute || entry.path,
      number: info.number,
      title: info.title || row?.title || `Plan ${info.number}`,
      why: info.why,
      priority: info.priority ?? row?.priority,
      dependsOn,
      status: row?.status ?? "UNKNOWN",
    });
  }
  return { plansDir: found.dirName, plans, warnings };
}

export async function previewPlanFiles(
  subject: string,
  sessionID: string,
): Promise<PlanFilePreview> {
  const [loaded, tasks] = await Promise.all([
    loadPlans(subject, sessionID),
    listTasks(subject, sessionID),
  ]);
  const imported = new Set(
    tasks.flatMap((task) => (task.source?.ref ? [task.source.ref] : [])),
  );
  return {
    plansDir: loaded.plansDir,
    items: loaded.plans.map((plan) => ({
      ref: plan.ref,
      number: plan.number,
      title: plan.title,
      priority: plan.priority,
      dependsOn: plan.dependsOn,
      status: plan.status,
      imported: imported.has(plan.ref),
    })),
    warnings: loaded.warnings,
  };
}

const PRIORITY_MAP: Record<PlanPriority, TaskPriority> = {
  P1: "high",
  P2: "medium",
  P3: "medium",
};

function statusFor(status: PlanIndexStatus): TaskStatus {
  switch (status) {
    case "DONE":
      return "completed";
    case "REJECTED":
      return "cancelled";
    case "BLOCKED":
      return "blocked";
    default:
      return "pending";
  }
}

export async function importPlanFiles(
  subject: string,
  sessionID: string,
  refs?: string[],
): Promise<PlanFileImportResult> {
  if (
    refs !== undefined &&
    (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string"))
  ) {
    throw new TaskValidationError("refs must be a list of plan file paths.");
  }
  const loaded = await loadPlans(subject, sessionID);
  const warnings = [...loaded.warnings];
  const selected = refs ? new Set(refs) : null;
  const chosen = loaded.plans.filter((plan) => !selected || selected.has(plan.ref));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  const { tasks } = await mutateTasks(subject, sessionID, (current) => {
    const now = Date.now();
    const byRef = new Map<string, Task>();
    for (const task of current) {
      if (task.source?.ref) byRef.set(task.source.ref, task);
    }

    // Sync status of tasks that were imported earlier.
    const created: Array<{ task: Task; plan: LoadedPlan }> = [];
    for (const plan of chosen) {
      const existing = byRef.get(plan.ref);
      if (existing) {
        const target = statusFor(plan.status);
        const syncable =
          plan.status === "DONE" || plan.status === "REJECTED" || plan.status === "BLOCKED";
        if (
          syncable &&
          existing.status !== "in_progress" &&
          existing.status !== "completed" &&
          existing.status !== target
        ) {
          existing.status = target;
          existing.updatedAt = now;
          if (target === "completed") existing.completedAt = now;
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }
      const status = statusFor(plan.status);
      const task: Task = {
        id: `tsk_${randomBytes(12).toString("base64url")}`,
        sessionID,
        title: `${plan.number} · ${plan.title}`.slice(0, MAX_TITLE),
        description: plan.why,
        prompt: planTaskPrompt(loaded.plansDir ?? "plans", plan.fileName),
        status,
        priority: plan.priority ? PRIORITY_MAP[plan.priority] : "medium",
        dependsOn: [],
        createdAt: now + created.length,
        updatedAt: now,
        ...(status === "completed" ? { completedAt: now } : {}),
        source: { kind: "plan-file", ref: plan.ref, path: plan.absolute },
      };
      created.push({ task, plan });
    }

    // Plan number -> task id, across already-imported and new tasks.
    const idByNumber = new Map<string, string>();
    for (const plan of loaded.plans) {
      const existing = byRef.get(plan.ref);
      if (existing) idByNumber.set(plan.number, existing.id);
    }
    for (const { task, plan } of created) idByNumber.set(plan.number, task.id);

    for (const { task } of created) current.push(task);
    added = created.length;

    for (const { task, plan } of created) {
      const ids: string[] = [];
      for (const number of plan.dependsOn) {
        const id = idByNumber.get(number);
        if (id) ids.push(id);
        else warnings.push(`${plan.number}: dependency on plan ${number} has no task; dropped.`);
      }
      try {
        task.dependsOn = validateDependencies(task.id, ids, current);
      } catch (error) {
        task.dependsOn = [];
        warnings.push(
          `${plan.number}: dependencies dropped (${
            error instanceof Error ? error.message : "invalid"
          })`,
        );
      }
    }
  });

  return { added, updated, skipped, warnings, tasks };
}
