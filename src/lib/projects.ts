import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { octaneDataDir } from "./env";
import {
  isAbsoluteProjectDirectory,
  normalizeProjectDirectory,
} from "./project-paths";
import type { Project, ProjectGithubLink, ProjectInput } from "./types";
import { userKey } from "./user-key";

const STORE_VERSION = 1;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_CONTEXT = 20_000;

type ProjectStore = {
  version: number;
  projects: Project[];
};

/** A validation failure that API routes should surface as a 400. */
export class ProjectValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

type ProjectPatch = Partial<ProjectInput>;

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

function storeDir(): string {
  return path.join(octaneDataDir(), "projects");
}

function storePath(subject: string): string {
  return path.join(storeDir(), `${userKey(subject)}.json`);
}

function emptyStore(): ProjectStore {
  return { version: STORE_VERSION, projects: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readStore(subject: string): Promise<ProjectStore> {
  let text: string;
  try {
    text = await fs.readFile(storePath(subject), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The projects file is not valid JSON. Fix or restore it before retrying.");
  }
  if (!isRecord(parsed) || parsed.version !== STORE_VERSION) {
    throw new Error(
      `Unsupported projects file version. Expected version ${STORE_VERSION}.`,
    );
  }
  if (!Array.isArray(parsed.projects)) {
    throw new Error("The projects file is missing its projects list.");
  }
  return { version: STORE_VERSION, projects: parsed.projects as Project[] };
}

async function writeStore(subject: string, store: ProjectStore): Promise<void> {
  const directory = storeDir();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = storePath(subject);
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EEXIST") throw error;
    // On Windows the destination can block rename. The temp file is complete,
    // so a crash between these two calls loses only this write.
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
  }
}

function requireName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProjectValidationError("Name is required.");
  }
  const name = value.trim();
  if (!name) throw new ProjectValidationError("Name is required.");
  if (name.length > MAX_NAME) {
    throw new ProjectValidationError(`Name must be ${MAX_NAME} characters or fewer.`);
  }
  return name;
}

function parseDescription(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ProjectValidationError("Description must be a string.");
  }
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION) {
    throw new ProjectValidationError(
      `Description must be ${MAX_DESCRIPTION} characters or fewer.`,
    );
  }
  return description || undefined;
}

function parseDirectory(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProjectValidationError("Choose an absolute folder path.");
  }
  const directory = normalizeProjectDirectory(value);
  if (!directory || !isAbsoluteProjectDirectory(directory)) {
    throw new ProjectValidationError("Choose an absolute folder path.");
  }
  return directory;
}

function parseContext(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ProjectValidationError("Project context must be text.");
  }
  if (value.length > MAX_CONTEXT) {
    throw new ProjectValidationError(
      `Project context must be ${MAX_CONTEXT.toLocaleString("en-US")} characters or fewer.`,
    );
  }
  return value;
}

function assertUnique(
  projects: Project[],
  candidate: { name: string; directory: string },
  ignoreId?: string,
): void {
  const name = candidate.name.toLowerCase();
  const directory = candidate.directory.toLowerCase();
  for (const project of projects) {
    if (project.id === ignoreId) continue;
    if (project.name.trim().toLowerCase() === name) {
      throw new ProjectValidationError("A project with this name already exists.");
    }
    if (normalizeProjectDirectory(project.directory).toLowerCase() === directory) {
      throw new ProjectValidationError("A project with this folder already exists.");
    }
  }
}

export async function listProjects(subject: string): Promise<Project[]> {
  const store = await readStore(subject);
  return [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(
  subject: string,
  id: string,
): Promise<Project | null> {
  const store = await readStore(subject);
  return store.projects.find((project) => project.id === id) ?? null;
}

export async function createProject(
  subject: string,
  input: ProjectInput,
  github?: ProjectGithubLink,
): Promise<Project> {
  const name = requireName(input?.name);
  const description = parseDescription(input?.description);
  const directory = parseDirectory(input?.directory);
  const context = parseContext(input?.context);
  const now = Date.now();
  const project: Project = {
    id: `prj_${randomBytes(12).toString("base64url")}`,
    name,
    ...(description ? { description } : {}),
    directory,
    context,
    ...(github ? { github } : {}),
    createdAt: now,
    updatedAt: now,
  };

  return withStoreLock(subject, async () => {
    const store = await readStore(subject);
    assertUnique(store.projects, project);
    store.projects.push(project);
    await writeStore(subject, store);
    return project;
  });
}

export async function updateProject(
  subject: string,
  id: string,
  input: ProjectPatch,
  github?: ProjectGithubLink | null,
): Promise<Project> {
  return withStoreLock(subject, async () => {
    const store = await readStore(subject);
    const index = store.projects.findIndex((project) => project.id === id);
    if (index === -1) {
      throw new ProjectValidationError("Project not found.");
    }
    const current = store.projects[index];
    const next: Project = {
      ...current,
      name: input?.name === undefined ? current.name : requireName(input.name),
      directory:
        input?.directory === undefined
          ? current.directory
          : parseDirectory(input.directory),
      context:
        input?.context === undefined ? current.context : parseContext(input.context),
      updatedAt: Date.now(),
    };

    if (input?.description !== undefined) {
      const description = parseDescription(input.description);
      if (description) next.description = description;
      else delete next.description;
    }

    if (github === null) delete next.github;
    else if (github !== undefined) next.github = github;

    assertUnique(store.projects, next, id);
    store.projects[index] = next;
    await writeStore(subject, store);
    return next;
  });
}

export async function deleteProject(subject: string, id: string): Promise<void> {
  await withStoreLock(subject, async () => {
    const store = await readStore(subject);
    store.projects = store.projects.filter((project) => project.id !== id);
    await writeStore(subject, store);
  });
}
