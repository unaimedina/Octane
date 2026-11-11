import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { octaneDataDir } from "./env";
import { clampParallel, DEFAULT_PARALLEL } from "./task-schedule-plan";
import {
  removeDependency,
  TaskConflictError,
  TaskValidationError,
  validateDependencies,
} from "./task-graph";
import type { Task, TaskInput, TaskPriority, TaskStatus, WorkerRecord } from "./types";
import {
  addWorkerRecord,
  mergeWorkerRecords,
  normalizeWorkerRecords,
} from "./worker-records";

export { TaskConflictError, TaskValidationError };

const STORE_VERSION = 2;
const MAX_TITLE = 500;
const MAX_DESCRIPTION = 20_000;
const MAX_PROMPT = 20_000;
const MAX_IMPORT = 100;

const STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "blocked",
  "cancelled",
];
const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

/** Per-session auto-run settings, stored next to the tasks. */
export type TaskRunnerSettings = {
  autoRun: boolean;
  /** Parallel worker sessions, 1..4. */
  maxParallel: number;
  /** Why auto-run stopped by itself, shown until dismissed. */
  stalled?: string;
  startedBy?: { subject: string; username: string };
  /** Model for worker sessions started by the scheduler. */
  model?: { providerID: string; modelID: string };
};

export const DEFAULT_RUNNER: TaskRunnerSettings = {
  autoRun: false,
  maxParallel: DEFAULT_PARALLEL,
};

type TaskStore = {
  version: number;
  sessionID: string;
  tasks: Task[];
  runner?: TaskRunnerSettings;
  workers?: WorkerRecord[];
};

export class TaskNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Task not found.") {
    super(message);
    this.name = "TaskNotFoundError";
  }
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function taskDir(subject: string): string {
  return path.join(octaneDataDir(), "tasks", hashKey(subject));
}

function taskPath(subject: string, sessionID: string): string {
  return path.join(taskDir(subject), `${hashKey(sessionID)}.json`);
}

function lockKey(subject: string, sessionID: string): string {
  return `${hashKey(subject)}:${hashKey(sessionID)}`;
}

const tails = new Map<string, Promise<void>>();

async function withStoreLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.catch(() => undefined).then(() => current);
  tails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
  }
}

function emptyStore(sessionID: string): TaskStore {
  return { version: STORE_VERSION, sessionID, tasks: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseModel(value: unknown): TaskRunnerSettings["model"] {
  if (
    isRecord(value) &&
    typeof value.providerID === "string" &&
    value.providerID &&
    typeof value.modelID === "string" &&
    value.modelID
  ) {
    return { providerID: value.providerID, modelID: value.modelID };
  }
  return undefined;
}

function normalizeRunner(value: unknown): TaskRunnerSettings {
  if (!isRecord(value)) return { ...DEFAULT_RUNNER };
  const runner: TaskRunnerSettings = {
    autoRun: value.autoRun === true,
    maxParallel: clampParallel(value.maxParallel),
  };
  if (typeof value.stalled === "string" && value.stalled) {
    runner.stalled = value.stalled.slice(0, 500);
  }
  const by = value.startedBy;
  if (isRecord(by) && typeof by.subject === "string" && typeof by.username === "string") {
    runner.startedBy = { subject: by.subject, username: by.username };
  }
  const model = parseModel(value.model);
  if (model) runner.model = model;
  return runner;
}

async function readStore(subject: string, sessionID: string): Promise<TaskStore> {
  let text: string;
  try {
    text = await fs.readFile(taskPath(subject, sessionID), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStore(sessionID);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The tasks file is not valid JSON. Fix or restore it before retrying.");
  }
  if (
    !isRecord(parsed) ||
    (parsed.version !== 1 && parsed.version !== STORE_VERSION)
  ) {
    throw new Error(
      `Unsupported tasks file version. Expected version ${STORE_VERSION} or older.`,
    );
  }
  if (!Array.isArray(parsed.tasks)) {
    throw new Error("The tasks file is missing its task list.");
  }
  // v1 tasks have no dependsOn. Migrate in memory; the next write persists v2.
  const tasks = (parsed.tasks as Task[]).map((task) =>
    Array.isArray(task.dependsOn) ? task : { ...task, dependsOn: [] },
  );
  const store: TaskStore = { version: STORE_VERSION, sessionID, tasks };
  if (parsed.runner !== undefined) store.runner = normalizeRunner(parsed.runner);
  if (parsed.workers !== undefined) store.workers = normalizeWorkerRecords(parsed.workers);
  return store;
}

async function writeStore(subject: string, sessionID: string, store: TaskStore): Promise<void> {
  const directory = taskDir(subject);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = taskPath(subject, sessionID);
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EEXIST") throw error;
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
  }
}

function parseTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("Task title is required.");
  }
  const title = value.trim();
  if (!title) throw new TaskValidationError("Task title is required.");
  if (title.length > MAX_TITLE) {
    throw new TaskValidationError(
      `Task title must be ${MAX_TITLE} characters or fewer.`,
    );
  }
  return title;
}

function parseDescription(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new TaskValidationError("Task definition must be text.");
  }
  if (value.length > MAX_DESCRIPTION) {
    throw new TaskValidationError(
      `Task definition must be ${MAX_DESCRIPTION.toLocaleString("en-US")} characters or fewer.`,
    );
  }
  return value.trim();
}

function parsePrompt(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new TaskValidationError("Task prompt must be text.");
  }
  if (value.length > MAX_PROMPT) {
    throw new TaskValidationError(
      `Task prompt must be ${MAX_PROMPT.toLocaleString("en-US")} characters or fewer.`,
    );
  }
  return value.trim();
}

function parseStatus(value: unknown): TaskStatus {
  if (value === undefined) return "pending";
  if (typeof value !== "string" || !STATUSES.includes(value as TaskStatus)) {
    throw new TaskValidationError("Invalid task status.");
  }
  return value as TaskStatus;
}

function parsePriority(value: unknown): TaskPriority {
  if (value === undefined) return "medium";
  if (typeof value !== "string" || !PRIORITIES.includes(value as TaskPriority)) {
    throw new TaskValidationError("Invalid task priority.");
  }
  return value as TaskPriority;
}

function buildTask(
  sessionID: string,
  input: TaskInput,
  now: number,
  existing: Task[] = [],
): Task {
  const status = parseStatus(input.status);
  if (status === "in_progress") {
    throw new TaskValidationError("A task can only be started with Run.");
  }
  return {
    id: `tsk_${randomBytes(12).toString("base64url")}`,
    sessionID,
    title: parseTitle(input.title),
    description: parseDescription(input.description),
    prompt: parsePrompt(input.prompt),
    status,
    priority: parsePriority(input.priority),
    dependsOn: validateDependencies(null, input.dependsOn, existing),
    createdAt: now,
    updatedAt: now,
    ...(status === "completed" ? { completedAt: now } : {}),
  };
}

export async function listTasks(subject: string, sessionID: string): Promise<Task[]> {
  const store = await readStore(subject, sessionID);
  return [...store.tasks].sort((a, b) => a.createdAt - b.createdAt);
}

export async function createTask(
  subject: string,
  sessionID: string,
  input: TaskInput,
): Promise<Task> {
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const task = buildTask(sessionID, input, Date.now(), store.tasks);
    store.tasks.push(task);
    await writeStore(subject, sessionID, store);
    return task;
  });
}

export async function updateTask(
  subject: string,
  sessionID: string,
  taskID: string,
  input: Partial<TaskInput>,
): Promise<Task> {
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const index = store.tasks.findIndex((task) => task.id === taskID);
    if (index === -1) throw new TaskNotFoundError();
    const current = store.tasks[index];
    const now = Date.now();
    const status = input.status === undefined ? current.status : parseStatus(input.status);
    if (current.status === "in_progress") {
      if (status !== "cancelled") {
        throw new TaskConflictError("Task is running. Stop it first.", "running");
      }
    } else if (status === "in_progress") {
      throw new TaskValidationError("A task can only be started with Run.");
    }
    const next: Task = {
      ...current,
      title: input.title === undefined ? current.title : parseTitle(input.title),
      description:
        input.description === undefined
          ? current.description
          : parseDescription(input.description),
      prompt: input.prompt === undefined ? current.prompt : parsePrompt(input.prompt),
      status,
      priority:
        input.priority === undefined
          ? current.priority
          : parsePriority(input.priority),
      dependsOn:
        input.dependsOn === undefined
          ? current.dependsOn
          : validateDependencies(taskID, input.dependsOn, store.tasks),
      updatedAt: now,
    };
    if (status === "cancelled" && current.status === "in_progress" && current.run) {
      next.run = {
        ...current.run,
        endedAt: now,
        outcome: "aborted",
        summary: "Cancelled while running.",
      };
    }
    if (status === "completed") {
      next.completedAt = current.completedAt ?? now;
    } else {
      delete next.completedAt;
    }
    store.tasks[index] = next;
    await writeStore(subject, sessionID, store);
    return next;
  });
}

export async function deleteTask(
  subject: string,
  sessionID: string,
  taskID: string,
): Promise<Task | null> {
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const removed = store.tasks.find((task) => task.id === taskID) ?? null;
    store.tasks = removeDependency(
      store.tasks.filter((task) => task.id !== taskID),
      taskID,
    );
    await writeStore(subject, sessionID, store);
    return removed;
  });
}

/**
 * Read-modify-write inside the store lock with a single write. `fn` may mutate
 * the array in place, return a replacement `Task[]`, or return
 * `{ tasks?, result? }` to also hand a value back to the caller. Internal
 * helper for the task runner, the run/stop routes and bulk imports.
 */
export type TaskMutation<T> =
  | Task[]
  | { tasks?: Task[]; result?: T }
  | void;

export async function mutateTasks<T = undefined>(
  subject: string,
  sessionID: string,
  fn: (tasks: Task[]) => TaskMutation<T> | Promise<TaskMutation<T>>,
): Promise<{ tasks: Task[]; result: T | undefined }> {
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const returned = await fn(store.tasks);
    const output: { tasks?: Task[]; result?: T } | void = Array.isArray(returned)
      ? { tasks: returned }
      : returned;
    if (output?.tasks) store.tasks = output.tasks;
    await writeStore(subject, sessionID, store);
    return {
      tasks: [...store.tasks].sort((a, b) => a.createdAt - b.createdAt),
      result: output?.result,
    };
  });
}

export type TaskImportResult = {
  tasks: Task[];
  added: number;
  skipped: number;
};

/** Import plan steps as tasks, skipping duplicate titles. */
export async function importTasks(
  subject: string,
  sessionID: string,
  inputs: TaskInput[],
): Promise<TaskImportResult> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TaskValidationError("Select at least one plan step to import.");
  }
  if (inputs.length > MAX_IMPORT) {
    throw new TaskValidationError(`Import at most ${MAX_IMPORT} tasks at once.`);
  }

  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const seen = new Set(
      store.tasks.map((task) => task.title.trim().toLowerCase()),
    );
    const now = Date.now();
    const added: Task[] = [];
    let skipped = 0;

    for (const input of inputs) {
      const title = typeof input?.title === "string" ? input.title.trim() : "";
      if (!title) {
        skipped += 1;
        continue;
      }
      const key = title.toLowerCase();
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      const task = buildTask(sessionID, { ...input, dependsOn: [] }, now);
      seen.add(key);
      store.tasks.push(task);
      added.push(task);
    }

    if (added.length > 0) await writeStore(subject, sessionID, store);
    return { tasks: added, added: added.length, skipped };
  });
}

export type RunnerPatch = {
  autoRun?: boolean;
  maxParallel?: number;
  /** null clears the stalled message. */
  stalled?: string | null;
  startedBy?: { subject: string; username: string };
  /** null clears the stored model. */
  model?: { providerID: string; modelID: string } | null;
};

export async function getRunner(
  subject: string,
  sessionID: string,
): Promise<TaskRunnerSettings> {
  const store = await readStore(subject, sessionID);
  return normalizeRunner(store.runner);
}

/**
 * Update the runner settings under the store lock. `patch` may be a function
 * of the current settings and tasks; returning null leaves them unchanged.
 */
export async function setRunner(
  subject: string,
  sessionID: string,
  patch:
    | RunnerPatch
    | ((runner: TaskRunnerSettings, tasks: Task[]) => RunnerPatch | null),
): Promise<TaskRunnerSettings> {
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const current = normalizeRunner(store.runner);
    const change = typeof patch === "function" ? patch(current, store.tasks) : patch;
    if (!change) return current;
    const next: TaskRunnerSettings = { ...current };
    if (typeof change.autoRun === "boolean") next.autoRun = change.autoRun;
    if (change.maxParallel !== undefined) {
      next.maxParallel = clampParallel(change.maxParallel);
    }
    if (change.stalled === null) delete next.stalled;
    else if (typeof change.stalled === "string") next.stalled = change.stalled.slice(0, 500);
    if (change.startedBy) next.startedBy = change.startedBy;
    if (change.model === null) delete next.model;
    else if (change.model) {
      const model = parseModel(change.model);
      if (model) next.model = model;
    }
    store.runner = next;
    await writeStore(subject, sessionID, store);
    return next;
  });
}

/** Remember a worker session started by this orchestrator session. */
export async function recordWorker(
  subject: string,
  sessionID: string,
  record: WorkerRecord,
): Promise<void> {
  await withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    store.workers = addWorkerRecord(store.workers ?? [], record);
    await writeStore(subject, sessionID, store);
  });
}

/** Workers of one orchestrator session (stored records + task.run), newest first. */
export async function listWorkers(subject: string, sessionID: string): Promise<WorkerRecord[]> {
  const store = await readStore(subject, sessionID);
  return mergeWorkerRecords(store.workers ?? [], store.tasks);
}

/** Every worker session id of this user, across all orchestrator sessions. */
export async function listWorkerSessionIds(subject: string): Promise<string[]> {
  let files: string[];
  try {
    files = await fs.readdir(taskDir(subject));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const ids = new Set<string>();
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed: unknown = JSON.parse(
        await fs.readFile(path.join(taskDir(subject), file), "utf8"),
      );
      if (!isRecord(parsed)) continue;
      const tasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Task[]) : [];
      for (const worker of mergeWorkerRecords(normalizeWorkerRecords(parsed.workers), tasks)) {
        ids.add(worker.sessionID);
      }
    } catch {
      // Skip unreadable files.
    }
  }
  return [...ids];
}
