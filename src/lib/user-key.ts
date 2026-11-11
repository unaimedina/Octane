import { createHash } from "node:crypto";

/** Stable, filesystem-safe directory name for a user subject. */
export function userKey(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 32);
}
