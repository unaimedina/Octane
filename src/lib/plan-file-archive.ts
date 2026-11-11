import fs from "node:fs/promises";
import path from "node:path";
import type { Task } from "./types";

/** Sub-folder of the plans folder that receives plans whose task was deleted. */
export const ARCHIVE_DIR = "done";

const PLAN_DIR = /^(?:advisor-)?plans$/;
const PLAN_NAME = /^\d{3}-[^/\\]+\.md$/;

export type PlanArchiveResult = {
  /** Plans-relative path the file was moved to, e.g. `plans/done/001-x.md`. */
  archived?: string;
  /** Why the plan file could not be archived. The task is deleted regardless. */
  warning?: string;
};

/**
 * Where to move a plan file, or null when `file` is not a top-level
 * `plans/NNN-*.md` or `advisor-plans/NNN-*.md` file. Pure.
 */
export function archiveTarget(file: string): { target: string; ref: string } | null {
  const normalized = file.trim().replace(/\\/g, "/");
  if (!normalized) return null;
  const name = path.posix.basename(normalized);
  const dir = path.posix.dirname(normalized);
  const dirName = path.posix.basename(dir);
  if (!PLAN_NAME.test(name) || !PLAN_DIR.test(dirName)) return null;
  return {
    target: path.posix.join(dir, ARCHIVE_DIR, name),
    ref: `${dirName}/${ARCHIVE_DIR}/${name}`,
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Pick a free name in the archive folder: `001-x.md`, then `001-x-2.md`, ... */
async function freeTarget(target: string): Promise<string> {
  if (!(await exists(target))) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, -ext.length);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * Move the plan file behind a plan-file task into `<plans>/done/`. Best effort:
 * failures come back as a warning so deleting the task never fails because of
 * the file.
 */
export async function archivePlanFile(task: Task): Promise<PlanArchiveResult> {
  if (task.source?.kind !== "plan-file") return {};
  const planned = archiveTarget(task.source.path);
  if (!planned) {
    return { warning: `${task.source.ref} is not in a plans folder; left in place.` };
  }
  const source = task.source.path;
  if (!(await exists(source))) {
    return {
      warning: `${task.source.ref} is not reachable from the OCTANE server; left in place.`,
    };
  }
  try {
    await fs.mkdir(path.dirname(planned.target), { recursive: true });
    const target = await freeTarget(planned.target);
    try {
      await fs.rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      await fs.copyFile(source, target);
      await fs.rm(source);
    }
    return {
      archived: `${path.posix.dirname(planned.ref)}/${path.basename(target)}`,
    };
  } catch (error) {
    return {
      warning: `Could not move ${task.source.ref} to ${ARCHIVE_DIR}/: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    };
  }
}
