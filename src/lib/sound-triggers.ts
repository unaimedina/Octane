export type SoundKind = "done" | "attention";
type StatusLike = { type?: string } | undefined;

/** A session finished: it was busy/retrying and is now idle. */
export function isFinishTransition(previous: StatusLike, next: StatusLike): boolean {
  return (previous?.type === "busy" || previous?.type === "retry") && next?.type === "idle";
}

/** Throttle: allow a sound if the same kind did not play within `gapMs`. */
export function shouldPlay(
  lastPlayed: Partial<Record<SoundKind, number>>,
  kind: SoundKind,
  now: number,
  gapMs = 1500,
): boolean {
  const last = lastPlayed[kind];
  return last === undefined || now - last >= gapMs;
}

/** Stored preference; anything but "off" means on (default on). */
export function soundsEnabled(stored: string | null): boolean {
  return stored !== "off";
}
