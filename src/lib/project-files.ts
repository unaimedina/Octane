import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CONTEXT_EXTENSIONS, sanitizeContextFilename, upsertContextBlock } from "./agents-block.ts";
import { ProjectValidationError, updateProject } from "./projects";
import type { Project, ProjectAgentsFile, ProjectContextFile } from "./types";

export const MAX_AGENTS_CHARS = 200_000;
export const MAX_CONTEXT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CONTEXT_FILES = 50;
export const MAX_CONTEXT_TOTAL_BYTES = 50 * 1024 * 1024;

const UNAVAILABLE_MESSAGE =
  "This project's folder isn't reachable from the OCTANE server. AGENTS.md and context files need the per-user server mode, or a shared mode server that uses the same filesystem.";

/** The project folder cannot be read from this server (status 409). */
export class ProjectFilesUnavailableError extends Error {
  readonly status = 409;
  readonly code = "project_files_unavailable";

  constructor() {
    super(UNAVAILABLE_MESSAGE);
    this.name = "ProjectFilesUnavailableError";
  }
}

/** A project file operation failed in a way the client should see. */
export class ProjectFilesError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413,
    readonly code: string = "bad_request",
  ) {
    super(message);
    this.name = "ProjectFilesError";
  }
}

/** The AGENTS.md etag did not match; carries the file as it is now. */
export class ProjectAgentsConflictError extends ProjectFilesError {
  constructor(readonly current: ProjectAgentsFile) {
    super("AGENTS.md changed on disk.", 409, "conflict");
    this.name = "ProjectAgentsConflictError";
  }
}

/** Map a project-files error to an HTTP status and JSON body, or null. */
export function describeProjectFilesError(
  error: unknown,
): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof ProjectAgentsConflictError) {
    return {
      status: 409,
      body: {
        error: "conflict",
        message: error.message,
        content: error.current.content,
        etag: error.current.etag,
      },
    };
  }
  if (error instanceof ProjectFilesUnavailableError) {
    return { status: 409, body: { error: error.code, message: error.message } };
  }
  if (error instanceof ProjectFilesError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  if (error instanceof ProjectValidationError) {
    return { status: 400, body: { error: "bad_request", message: error.message } };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Locking and atomic writes                                                   */
/* -------------------------------------------------------------------------- */

const tails = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
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

function lockKey(project: Project): string {
  return `agents:${project.id}`;
}

async function atomicWrite(file: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${file}.octane-tmp`;
  await fs.writeFile(temporary, data, { mode: 0o644 });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EEXIST") {
      await fs.rm(temporary, { force: true });
      throw error;
    }
    // On Windows the destination can block rename. The temp file is complete.
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
  }
}

/* -------------------------------------------------------------------------- */
/* Gate and containment                                                        */
/* -------------------------------------------------------------------------- */

/** Resolve the project folder's real path, or throw when it isn't reachable. */
export async function assertLocalProjectDir(project: Project): Promise<string> {
  try {
    const stat = await fs.stat(project.directory);
    if (!stat.isDirectory()) throw new Error("not a directory");
    return await fs.realpath(project.directory);
  } catch {
    throw new ProjectFilesUnavailableError();
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function assertInside(root: string, target: string): void {
  if (!isInside(root, target)) {
    throw new ProjectFilesError("That path is outside the project folder.", 400);
  }
}

function contextDir(root: string): string {
  return path.join(root, ".octane", "context");
}

/** Create (if needed) and return the real context directory, checked for symlink escapes. */
async function ensureContextDir(root: string): Promise<string> {
  const directory = contextDir(root);
  assertInside(root, directory);
  await fs.mkdir(directory, { recursive: true });
  const real = await fs.realpath(directory);
  assertInside(root, real);
  return real;
}

/* -------------------------------------------------------------------------- */
/* AGENTS.md                                                                   */
/* -------------------------------------------------------------------------- */

function etagOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

async function agentsPath(root: string): Promise<string> {
  const entries = await fs.readdir(root);
  const found = entries.find((entry) => entry.toLowerCase() === "agents.md");
  return path.join(root, found ?? "AGENTS.md");
}

async function readAgentsAt(file: string): Promise<ProjectAgentsFile> {
  try {
    const bytes = await fs.readFile(file);
    return {
      exists: true,
      content: bytes.toString("utf8"),
      etag: etagOf(bytes),
      path: file,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, content: "", etag: "missing", path: file };
    }
    throw error;
  }
}

export async function readAgents(project: Project): Promise<ProjectAgentsFile> {
  const root = await assertLocalProjectDir(project);
  return readAgentsAt(await agentsPath(root));
}

export async function writeAgents(
  project: Project,
  content: string,
  ifMatch: string,
): Promise<ProjectAgentsFile> {
  if (typeof content !== "string") {
    throw new ProjectFilesError("Content must be text.", 400);
  }
  if (content.length > MAX_AGENTS_CHARS) {
    throw new ProjectFilesError(
      `AGENTS.md must be ${MAX_AGENTS_CHARS.toLocaleString("en-US")} characters or fewer.`,
      400,
    );
  }
  if (typeof ifMatch !== "string" || !ifMatch) {
    throw new ProjectFilesError("Send ifMatch with the etag you loaded.", 400);
  }
  const root = await assertLocalProjectDir(project);
  return withLock(lockKey(project), async () => {
    const file = await agentsPath(root);
    assertInside(root, file);
    const current = await readAgentsAt(file);
    if (current.etag !== ifMatch) throw new ProjectAgentsConflictError(current);
    await atomicWrite(file, content);
    return readAgentsAt(file);
  });
}

/* -------------------------------------------------------------------------- */
/* Context files                                                               */
/* -------------------------------------------------------------------------- */

const MIME_BY_EXTENSION: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".lua": "text/x-lua",
  ".py": "text/x-python",
  ".sql": "application/sql",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

function mimeFor(name: string): string {
  const extension = path.extname(name).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

async function listAt(directory: string): Promise<ProjectContextFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: ProjectContextFile[] = [];
  for (const name of entries) {
    if (!(CONTEXT_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase())) {
      continue;
    }
    try {
      const stat = await fs.lstat(path.join(directory, name));
      if (!stat.isFile()) continue;
      files.push({
        name,
        size: stat.size,
        updatedAt: stat.mtimeMs,
        mime: mimeFor(name),
      });
    } catch {
      // removed while listing
    }
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function listContextFiles(project: Project): Promise<ProjectContextFile[]> {
  const root = await assertLocalProjectDir(project);
  const directory = contextDir(root);
  assertInside(root, directory);
  try {
    assertInside(root, await fs.realpath(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return listAt(directory);
}

/** Rewrite the managed block to match the files on disk. Call under the lock. */
async function refreshBlock(root: string, directory: string): Promise<void> {
  const files = await listAt(directory);
  const file = await agentsPath(root);
  assertInside(root, file);
  const current = await readAgentsAt(file);
  if (!current.exists && files.length === 0) return;
  const next = upsertContextBlock(current.content, files);
  if (current.exists && next === current.content) return;
  if (!current.exists && next === "") return;
  await atomicWrite(file, next);
}

export async function refreshContextBlock(project: Project): Promise<void> {
  const root = await assertLocalProjectDir(project);
  await withLock(lockKey(project), async () => {
    await refreshBlock(root, contextDir(root));
  });
}

export async function saveContextFile(
  project: Project,
  name: string,
  bytes: Uint8Array,
): Promise<ProjectContextFile> {
  const safe = sanitizeContextFilename(name);
  if (!safe) {
    throw new ProjectFilesError(
      `Unsupported file name or type. Allowed: ${CONTEXT_EXTENSIONS.join(" ")}`,
      400,
    );
  }
  if (bytes.byteLength > MAX_CONTEXT_FILE_BYTES) {
    throw new ProjectFilesError("Files must be 5 MB or smaller.", 413, "too_large");
  }
  const root = await assertLocalProjectDir(project);
  return withLock(lockKey(project), async () => {
    const directory = await ensureContextDir(root);
    const target = path.join(directory, safe);
    assertInside(root, target);
    assertInside(directory, target);

    const existing = await listAt(directory);
    const others = existing.filter((file) => file.name !== safe);
    if (others.length + 1 > MAX_CONTEXT_FILES) {
      throw new ProjectFilesError(
        `A project can hold at most ${MAX_CONTEXT_FILES} context files.`,
        409,
        "limit_reached",
      );
    }
    const total = others.reduce((sum, file) => sum + file.size, 0) + bytes.byteLength;
    if (total > MAX_CONTEXT_TOTAL_BYTES) {
      throw new ProjectFilesError(
        "Context files are limited to 50 MB per project.",
        409,
        "limit_reached",
      );
    }

    await atomicWrite(target, bytes);
    await refreshBlock(root, directory);
    const stat = await fs.stat(target);
    return { name: safe, size: stat.size, updatedAt: stat.mtimeMs, mime: mimeFor(safe) };
  });
}

export async function deleteContextFile(project: Project, name: string): Promise<void> {
  const safe = sanitizeContextFilename(name);
  if (!safe || safe !== name) {
    throw new ProjectFilesError("Invalid file name.", 400);
  }
  const root = await assertLocalProjectDir(project);
  await withLock(lockKey(project), async () => {
    const directory = contextDir(root);
    assertInside(root, directory);
    let real: string;
    try {
      real = await fs.realpath(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectFilesError("File not found.", 404, "not_found");
      }
      throw error;
    }
    assertInside(root, real);
    const target = path.join(real, safe);
    assertInside(real, target);
    try {
      await fs.unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectFilesError("File not found.", 404, "not_found");
      }
      throw error;
    }
    await refreshBlock(root, real);
  });
}

/* -------------------------------------------------------------------------- */
/* Legacy context migration                                                    */
/* -------------------------------------------------------------------------- */

const MIGRATED_HEADING = "## Project context (migrated)";

export async function migrateLegacyContext(
  subject: string,
  project: Project,
): Promise<{ agents: ProjectAgentsFile; project: Project }> {
  const root = await assertLocalProjectDir(project);
  const legacy = project.context.trim();
  const agents = await withLock(lockKey(project), async () => {
    const file = await agentsPath(root);
    assertInside(root, file);
    const current = await readAgentsAt(file);
    const section = `${MIGRATED_HEADING}\n\n${legacy}\n`;
    if (!legacy || current.content.includes(section)) return current;
    const next = current.content ? `${current.content}\n\n${section}` : section;
    await atomicWrite(file, next);
    return readAgentsAt(file);
  });
  const updated = legacy
    ? await updateProject(subject, project.id, { context: "" })
    : project;
  return { agents, project: updated };
}
