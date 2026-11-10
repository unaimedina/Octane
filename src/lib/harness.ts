import type { HarnessId } from "./types";

export type { HarnessId };

export const HARNESS_LABELS: Record<HarnessId, string> = {
  opencode: "OpenCode",
};

export function harnessLabel(harness: HarnessId): string {
  return HARNESS_LABELS[harness];
}
