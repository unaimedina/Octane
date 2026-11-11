import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { octaneDataDir } from "./env";
import {
  removeDependency,
  TaskConflictError,
  TaskValidationError,
  validateDependencies,
} from "./task-graph";
import type { Task, TaskInput, TaskPriority, TaskStatus } from "./types";

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

type TaskStore = {
  version: number;
  sessionID: string;
  tasks: Task[];
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
  return { version: STORE_VERSION, sessionID, tasks };
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
): Promise<void> {
  await withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    store.tasks = removeDependency(
      store.tasks.filter((task) => task.id !== taskID),
      taskID,
    );
    await writeStore(subject, sessionID, store);
  });
}

/**
 * Read-modify-write inside the store lock with a single write. `fn` may mutate
 * the array in place or return a replacement. Internal helper for the task
 * runner and the run/stop routes.
 */
export async function mutateTasks<T = undefined>(
  subject: string,
  sessionID: string,
  fn: (tasks: Task[]) => { tasks?: Task[]; result?: T } | void,
): Promise<{ tasks: Task[]; result: T | undefined }> {
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
    const output = fn(store.tasks);
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
