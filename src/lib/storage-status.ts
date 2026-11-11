import fs from "node:fs/promises";
import { octaneDataDir } from "./env";
import { classifyPath, type StoragePersistence } from "./storage-check";

let cached: Promise<StoragePersistence> | null = null;

/**
 * Whether OCTANE_DATA_DIR survives a container being recreated. Linux only;
 * "unknown" elsewhere or when /proc is unavailable. Computed once per process.
 */
export function dataDirPersistence(): Promise<StoragePersistence> {
  cached ??= (async () => {
    if (process.platform !== "linux") return "unknown";
    let mountinfo: string;
    try {
      mountinfo = await fs.readFile("/proc/self/mountinfo", "utf8");
    } catch {
      return "unknown";
    }
    const result = classifyPath(mountinfo, octaneDataDir());
    if (result === "ephemeral") {
      console.warn(
        `[octane] OCTANE_DATA_DIR (${octaneDataDir()}) is not on a volume. ` +
          "Projects, tasks and GitHub connections will be lost when this " +
          "container is recreated (for example after pulling a new image). " +
          "Mount a volume there; see README › Docker notes.",
      );
    }
    return result;
  })();
  return cached;
}
