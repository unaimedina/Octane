import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { octaneDataDir } from "./env";
import type { Task, TaskInput, TaskPriority, TaskStatus } from "./types";

const STORE_VERSION = 1;
const MAX_TITLE = 500;
const MAX_DESCRIPTION = 20_000;
const MAX_PROMPT = 20_000;
const MAX_IMPORT = 100;

const STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];
const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

type TaskStore = {
  version: number;
  sessionID: string;
  tasks: Task[];
};

export class TaskValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

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
  if (!isRecord(parsed) || parsed.version !== STORE_VERSION) {
    throw new Error(
      `Unsupported tasks file version. Expected version ${STORE_VERSION}.`,
    );
  }
  if (!Array.isArray(parsed.tasks)) {
    throw new Error("The tasks file is missing its task list.");
  }
  return {
    version: STORE_VERSION,
    sessionID,
    tasks: parsed.tasks as Task[],
  };
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
): Task {
  const status = parseStatus(input.status);
  return {
    id: `tsk_${randomBytes(12).toString("base64url")}`,
    sessionID,
    title: parseTitle(input.title),
    description: parseDescription(input.description),
    prompt: parsePrompt(input.prompt),
    status,
    priority: parsePriority(input.priority),
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
  const now = Date.now();
  const task = buildTask(sessionID, input, now);
  return withStoreLock(lockKey(subject, sessionID), async () => {
    const store = await readStore(subject, sessionID);
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
      updatedAt: now,
    };
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
    store.tasks = store.tasks.filter((task) => task.id !== taskID);
    await writeStore(subject, sessionID, store);
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
      const task = buildTask(sessionID, input, now);
      seen.add(key);
      store.tasks.push(task);
      added.push(task);
    }

    if (added.length > 0) await writeStore(subject, sessionID, store);
    return { tasks: added, added: added.length, skipped };
  });
}
