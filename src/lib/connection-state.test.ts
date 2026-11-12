import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROBES,
  STREAM_GRACE_MS,
  deriveConnectionState,
  pushProbe,
  type HealthProbe,
} from "./connection-state.ts";

const NOW = 1_000_000;

function ok(extra: Partial<Extract<HealthProbe, { ok: true }>> = {}): HealthProbe {
  return {
    ok: true,
    latencyMs: 18.4,
    upstreamHealthy: true,
    unauthorized: false,
    version: "2.2.6",
    at: NOW,
    ...extra,
  };
}

function fail(): HealthProbe {
  return { ok: false, at: NOW };
}

function derive(probes: HealthProbe[], streamConnected = true, streamDownSince: number | null = null) {
  return deriveConnectionState({ streamConnected, streamDownSince, probes, now: NOW });
}

test("rule 1: unauthorized upstream wins over everything", () => {
  assert.deepEqual(derive([ok({ unauthorized: true, upstreamHealthy: false })], false, NOW - STREAM_GRACE_MS), {
    kind: "disconnected",
    reason: "unauthorized",
  });
});

test("rule 2: stream down for the grace period is disconnected", () => {
  assert.deepEqual(derive([ok()], false, NOW - STREAM_GRACE_MS), {
    kind: "disconnected",
    reason: "stream",
  });
});

test("rule 2: stream down for less than the grace period is reconnecting", () => {
  assert.deepEqual(derive([ok()], false, NOW - STREAM_GRACE_MS + 1), { kind: "reconnecting" });
});

test("rule 3: two failed probes in a row is disconnected", () => {
  assert.deepEqual(derive([ok(), fail(), fail()]), { kind: "disconnected", reason: "probe" });
});

test("rule 4: OpenCode answering but unhealthy is disconnected", () => {
  assert.deepEqual(derive([ok({ upstreamHealthy: false })]), {
    kind: "disconnected",
    reason: "upstream",
  });
});

test("rule 5: a single failed probe is reconnecting", () => {
  assert.deepEqual(derive([ok(), fail()]), { kind: "reconnecting" });
});

test("rule 5: no probes yet with the stream open is reconnecting", () => {
  assert.deepEqual(derive([]), { kind: "reconnecting" });
});

test("rule 6: healthy probe and open stream is connected with rounded latency", () => {
  assert.deepEqual(derive([ok()]), { kind: "connected", latencyMs: 18, version: "2.2.6" });
});

test("recovered after a failure is connected again", () => {
  assert.deepEqual(derive([fail(), fail(), ok({ latencyMs: 41.6 })]), {
    kind: "connected",
    latencyMs: 42,
    version: "2.2.6",
  });
});

test("pushProbe keeps only the most recent probes", () => {
  let probes: HealthProbe[] = [];
  for (let index = 0; index < MAX_PROBES + 2; index++) {
    probes = pushProbe(probes, ok({ latencyMs: index }));
  }
  assert.equal(probes.length, MAX_PROBES);
  assert.equal((probes.at(-1) as Extract<HealthProbe, { ok: true }>).latencyMs, MAX_PROBES + 1);
});
