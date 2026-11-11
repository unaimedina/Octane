/**
 * Decides whether a folder lives on its own mount (a Docker volume or bind
 * mount) or only in the container's writable layer, from the text of
 * /proc/self/mountinfo. Pure: no filesystem access, so it is unit-testable.
 */

export type StoragePersistence = "persistent" | "ephemeral" | "unknown";

export type MountEntry = { mountPoint: string; fsType: string };

/** Undo mountinfo's octal escapes (\040 space, \011 tab, \012 newline, \134 backslash). */
export function unescapeMountPath(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

export function parseMountinfo(text: string): MountEntry[] {
  const entries: MountEntry[] = [];
  for (const line of text.split("\n")) {
    const separator = line.indexOf(" - ");
    if (separator === -1) continue;
    const before = line.slice(0, separator).split(" ");
    const after = line.slice(separator + 3).split(" ");
    if (before.length < 5 || after.length < 1 || !after[0]) continue;
    entries.push({ mountPoint: unescapeMountPath(before[4]), fsType: after[0] });
  }
  return entries;
}

function isWithin(target: string, mountPoint: string): boolean {
  if (mountPoint === "/") return true;
  return target === mountPoint || target.startsWith(`${mountPoint}/`);
}

/**
 * "persistent" when the deepest mount containing `target` is not the root
 * filesystem; "ephemeral" when only `/` contains it and `/` is an overlay
 * (a container's writable layer); "unknown" otherwise.
 */
export function classifyPath(mountinfo: string, target: string): StoragePersistence {
  const normalized = target.length > 1 ? target.replace(/\/+$/, "") : target;
  if (!normalized.startsWith("/")) return "unknown";
  let best: MountEntry | null = null;
  for (const entry of parseMountinfo(mountinfo)) {
    if (!isWithin(normalized, entry.mountPoint)) continue;
    if (!best || entry.mountPoint.length >= best.mountPoint.length) best = entry;
  }
  if (!best) return "unknown";
  if (best.mountPoint !== "/") return "persistent";
  return best.fsType === "overlay" ? "ephemeral" : "unknown";
}
