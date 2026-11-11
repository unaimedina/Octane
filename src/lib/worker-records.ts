import type { Task, WorkerRecord } from "./types";

export const MAX_WORKER_RECORDS = 200;

function finish(records: WorkerRecord[]): WorkerRecord[] {
  const seen = new Set<string>();
  const unique: WorkerRecord[] = [];
  // Stable sort keeps the first occurrence of a duplicate (the preferred one).
  const sorted = [...records].sort((a, b) => b.startedAt - a.startedAt);
  for (const record of sorted) {
    if (seen.has(record.sessionID)) continue;
    seen.add(record.sessionID);
    unique.push(record);
  }
  return unique.slice(0, MAX_WORKER_RECORDS);
}

/** Keep only well-formed records, newest first, unique by sessionID, capped. */
export function normalizeWorkerRecords(value: unknown): WorkerRecord[] {
  if (!Array.isArray(value)) return [];
  const records: WorkerRecord[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.sessionID !== "string" || !entry.sessionID) continue;
    if (typeof entry.taskId !== "string" || !entry.taskId) continue;
    if (typeof entry.title !== "string") continue;
    if (typeof entry.startedAt !== "number" || !Number.isFinite(entry.startedAt)) continue;
    records.push({
      sessionID: entry.sessionID,
      taskId: entry.taskId,
      title: entry.title.slice(0, 120),
      startedAt: entry.startedAt,
    });
  }
  return finish(records);
}

/**
 * Records from the store plus workers only known from task.run (stores written
 * before this feature), deduplicated by sessionID, newest first, capped.
 */
export function mergeWorkerRecords(records: WorkerRecord[], tasks: Task[]): WorkerRecord[] {
  const derived: WorkerRecord[] = [];
  for (const task of tasks) {
    const run = task.run;
    if (!run || run.mode !== "worker" || !run.sessionID) continue;
    derived.push({
      sessionID: run.sessionID,
      taskId: task.id,
      title: String(task.title ?? "").slice(0, 120),
      startedAt: run.startedAt,
    });
  }
  // Store records come first so they win on a clash.
  return finish([...records, ...derived]);
}

/** Add or refresh one record (same sessionID replaces), newest first, capped. */
export function addWorkerRecord(records: WorkerRecord[], record: WorkerRecord): WorkerRecord[] {
  const others = records.filter((item) => item.sessionID !== record.sessionID);
  return finish([record, ...others]);
}
