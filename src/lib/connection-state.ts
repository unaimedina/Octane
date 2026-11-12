/**
 * Connection state shown in the top bar ("Connected · 18 ms").
 *
 * Combines two signals: the browser's live event stream and an end-to-end
 * probe of `/api/health` (browser → OCTANE → OpenCode). Pure so it can be
 * unit tested with `node --test`.
 */

export type HealthProbe =
  | {
      ok: true;
      latencyMs: number;
      upstreamHealthy: boolean;
      unauthorized: boolean;
      version: string | null;
      at: number;
    }
  | { ok: false; at: number };

export type DisconnectReason = "stream" | "upstream" | "unauthorized" | "probe";

export type ConnectionState =
  | { kind: "connected"; latencyMs: number; version: string | null }
  | { kind: "reconnecting" }
  | { kind: "disconnected"; reason: DisconnectReason };

/** How long the event stream may stay down before we call it disconnected. */
export const STREAM_GRACE_MS = 30_000;

/** Probes kept for the derivation (most recent last). */
export const MAX_PROBES = 3;

export function deriveConnectionState(input: {
  streamConnected: boolean;
  /** ms timestamp when the event stream last went down, or null while it's up. */
  streamDownSince: number | null;
  /** Most recent last; only the last {@link MAX_PROBES} matter. */
  probes: HealthProbe[];
  now: number;
}): ConnectionState {
  const { streamConnected, streamDownSince, probes, now } = input;
  const last = probes.at(-1);
  const previous = probes.at(-2);

  if (last?.ok && last.unauthorized) {
    return { kind: "disconnected", reason: "unauthorized" };
  }
  if (!streamConnected && streamDownSince !== null && now - streamDownSince >= STREAM_GRACE_MS) {
    return { kind: "disconnected", reason: "stream" };
  }
  if (last && !last.ok && previous && !previous.ok) {
    return { kind: "disconnected", reason: "probe" };
  }
  if (last?.ok && !last.upstreamHealthy) {
    return { kind: "disconnected", reason: "upstream" };
  }
  if (!streamConnected || !last || !last.ok) {
    return { kind: "reconnecting" };
  }
  return { kind: "connected", latencyMs: Math.round(last.latencyMs), version: last.version };
}

/** Append a probe and keep only the most recent {@link MAX_PROBES}. */
export function pushProbe(probes: HealthProbe[], probe: HealthProbe): HealthProbe[] {
  return [...probes, probe].slice(-MAX_PROBES);
}
