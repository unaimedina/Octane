/**
 * Compact elapsed time for task rows: `12.4s`, `3m 05s`, `1h 12m`.
 * Rounds down so a running timer never shows a value it hasn't reached yet.
 */
export function formatElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (safe < 60_000) {
    return `${(Math.floor(safe / 100) / 10).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(safe / 1000);
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
