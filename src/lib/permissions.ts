import type { Permission } from "./types";

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Map an OpenCode v2 permission request (event payload or list item) to the UI
 * shape. Kept free of runtime imports so `node --test` can load it like
 * `questions.ts`.
 */
export function normalizePermissionRequest(
  value: unknown,
  fallbackSessionID = "",
  created = Date.now(),
): Permission | null {
  const data = obj(value) ?? {};
  const chosen = data.request ?? data.permission ?? data;
  const request = obj(chosen) ?? {};
  const id = str(request.id, str(data.requestID));
  const sessionID = str(request.sessionID, fallbackSessionID);
  if (!id || !sessionID) return null;

  const source = obj(request.source);
  const resources = arr(request.resources).map((item) => str(item));
  const action = str(request.action, "tool");
  const metadata: Record<string, unknown> = {
    ...(obj(request.metadata) ?? {}),
    source: request.source,
    message: request.message,
  };
  // The list payload carries no `metadata`, so a shell request with exactly one
  // resource would render without its command. The resource *is* the command.
  if (
    typeof metadata.command !== "string" &&
    action === "shell" &&
    resources.length === 1
  ) {
    metadata.command = resources[0];
  }

  const permission: Permission = {
    id,
    sessionID,
    messageID: str(request.messageID) || str(source?.messageID),
    type: action,
    title: str(request.title, str(request.message, `Allow ${action}`)),
    metadata,
    time: { created },
  };
  if (resources.length > 0) permission.pattern = resources;
  const callID = str(source?.callID) || str(source?.id);
  if (callID) permission.callID = callID;
  return permission;
}

/**
 * Merge a catch-up fetch that covered `scope` session IDs into the current list.
 *
 * - Out-of-scope items are kept untouched (they were not re-checked).
 * - For in-scope sessions the fetch is the truth: new items are appended and
 *   items the server no longer lists are dropped.
 * - An in-scope item that arrived by live event within `graceMs` is kept even if
 *   the fetch (which may have started before it existed) does not list it.
 * - Existing order is preserved; ids are never duplicated.
 */
export function mergePendingPermissions(input: {
  current: Permission[];
  fetched: Permission[];
  scope: ReadonlySet<string>;
  /** id -> ms timestamp it arrived by live event */
  liveArrivals: ReadonlyMap<string, number>;
  now: number;
  graceMs?: number;
}): Permission[] {
  const { current, fetched, scope, liveArrivals, now, graceMs = 5_000 } = input;
  const fetchedIds = new Set(fetched.map((item) => item.id));
  const kept = current.filter((item) => {
    if (!scope.has(item.sessionID)) return true;
    if (fetchedIds.has(item.id)) return true;
    const arrivedAt = liveArrivals.get(item.id);
    return arrivedAt !== undefined && now - arrivedAt < graceMs;
  });
  const known = new Set(kept.map((item) => item.id));
  const additions: Permission[] = [];
  for (const item of fetched) {
    if (known.has(item.id)) continue;
    known.add(item.id);
    additions.push(item);
  }
  return additions.length > 0 ? [...kept, ...additions] : kept;
}
