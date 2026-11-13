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

/**
 * Compact countdown for usage windows: `<1m`, `52m`, `1h 49m`, `2d 23h`.
 * Expired or invalid values read `now`.
 */
export function formatResetIn(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}m`;
  const days = Math.floor(hours / 24);
  if (days < 1) return `${hours}h ${minutes % 60}m`;
  return `${days}d ${hours % 24}h`;
}
