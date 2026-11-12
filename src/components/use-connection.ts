"use client";

import * as React from "react";
import { useAppData } from "@/components/app-data";
import {
  deriveConnectionState,
  pushProbe,
  type ConnectionState,
  type HealthProbe,
} from "@/lib/connection-state";

const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
const TICK_WHILE_DOWN_MS = 5_000;

type HealthResponse = {
  upstream?: { healthy?: boolean; unauthorized?: boolean; version?: string | null };
};

async function probeHealth(): Promise<HealthProbe> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { ok: false, at: Date.now() };
    const data = (await response.json()) as HealthResponse;
    const latencyMs = performance.now() - started;
    return {
      ok: true,
      latencyMs,
      upstreamHealthy: Boolean(data.upstream?.healthy),
      unauthorized: Boolean(data.upstream?.unauthorized),
      version: data.upstream?.version ?? null,
      at: Date.now(),
    };
  } catch {
    return { ok: false, at: Date.now() };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * End-to-end connection state (browser → OCTANE → OpenCode).
 * Call it ONCE (in AppShell) and pass the result down: each call runs its own probe loop.
 */
export function useConnection(): ConnectionState {
  const { connected, streamDownSince } = useAppData();
  const [probes, setProbes] = React.useState<HealthProbe[]>([]);
  const [now, setNow] = React.useState(() => Date.now());

  const runProbe = React.useCallback(async () => {
    const probe = await probeHealth();
    setProbes((current) => pushProbe(current, probe));
    setNow(Date.now());
  }, []);

  // Probe loop: every 15 s while visible, immediately when the tab becomes visible.
  React.useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== "visible") return;
      void runProbe();
      timer = window.setInterval(() => void runProbe(), PROBE_INTERVAL_MS);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [runProbe]);

  // Probe right away when the live stream (re)opens.
  React.useEffect(() => {
    if (!connected) return;
    const timer = window.setTimeout(() => void runProbe(), 0);
    return () => window.clearTimeout(timer);
  }, [connected, runProbe]);

  // While the stream is down, re-derive periodically so the 30 s grace
  // period is reached even without a new probe.
  React.useEffect(() => {
    if (connected) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_WHILE_DOWN_MS);
    return () => window.clearInterval(timer);
  }, [connected]);

  return deriveConnectionState({ streamConnected: connected, streamDownSince, probes, now });
}
