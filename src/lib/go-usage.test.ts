import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanKey, normalizeGoUsage, pickCredential } from "./go-usage.ts";

test("cleanKey trims and strips a Bearer prefix", () => {
  assert.equal(cleanKey("  sk-test  "), "sk-test");
  assert.equal(cleanKey("Bearer sk-test"), "sk-test");
  assert.equal(cleanKey("bearer   sk-test"), "sk-test");
  assert.equal(cleanKey(""), null);
  assert.equal(cleanKey(42), null);
  assert.equal(cleanKey("Bearer   "), null);
});

test("pickCredential prefers opencode-go over opencode", () => {
  const auth = {
    "opencode-go": { type: "api", key: "go-key" },
    opencode: { type: "api", key: "console-key" },
  };
  assert.equal(pickCredential(auth), "go-key");
});

test("pickCredential reads api and zen keys", () => {
  assert.equal(pickCredential({ "opencode-go": { type: "api", key: " a " } }), "a");
  assert.equal(pickCredential({ "opencode-go": { type: "zen", key: "z" } }), "z");
  assert.equal(
    pickCredential({ "opencode-go": { type: "api", key: "Bearer b" } }),
    "b",
  );
});

test("pickCredential accepts an unexpired oauth access token", () => {
  const now = 1_800_000_000_000;
  assert.equal(
    pickCredential(
      { opencode: { type: "oauth", access: "token", expires: now + 1 } },
      now,
    ),
    "token",
  );
  assert.equal(
    pickCredential(
      { opencode: { type: "oauth", access: "token", expires: now - 1 } },
      now,
    ),
    null,
  );
});

test("pickCredential ignores malformed input", () => {
  assert.equal(pickCredential(null), null);
  assert.equal(pickCredential("nope"), null);
  assert.equal(pickCredential({}), null);
  assert.equal(pickCredential({ "opencode-go": { type: "api" } }), null);
  assert.equal(pickCredential({ "opencode-go": { type: "unknown", key: "k" } }), null);
});

test("normalizeGoUsage parses the documented payload", () => {
  const result = normalizeGoUsage({
    usage: {
      rolling: { status: "ok", percent: 5, resetsAt: "2026-09-10T22:28:25.778Z" },
      weekly: { status: "ok", percent: 2, resetsAt: "2026-09-14T00:00:00.778Z" },
      monthly: { status: "ok", percent: 7, resetsAt: "2026-09-30T23:29:32.778Z" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.windows.map((window) => window.id),
    ["rolling", "weekly", "monthly"],
  );
  assert.equal(result.windows[0].percent, 5);
  assert.equal(result.windows[0].resetsAt, Date.parse("2026-09-10T22:28:25.778Z"));
  assert.equal(result.windows[1].status, "ok");
  assert.equal(result.windows[2].percent, 7);
});

test("normalizeGoUsage clamps percentages and maps rate-limited", () => {
  const result = normalizeGoUsage({
    usage: {
      rolling: { status: "ok", percent: -5, resetsAt: "2026-09-10T22:28:25.778Z" },
      weekly: { status: "rate-limited", percent: 140, resetsAt: "not-a-date" },
      monthly: { status: "ok", percent: 0.5, resetsAt: "2026-09-30T23:29:32.778Z" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.windows[0].percent, 0);
  assert.equal(result.windows[1].percent, 100);
  assert.equal(result.windows[1].status, "rate-limited");
  assert.equal(result.windows[1].resetsAt, null);
  assert.equal(result.windows[2].percent, 0.5);
});

test("normalizeGoUsage rejects unusable payloads", () => {
  assert.deepEqual(normalizeGoUsage(null), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeGoUsage({}), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeGoUsage({ usage: null }), {
    ok: false,
    reason: "invalid",
  });
  assert.deepEqual(
    normalizeGoUsage({ usage: { weekly: { percent: 2 } } }),
    { ok: false, reason: "invalid" },
  );
  assert.deepEqual(
    normalizeGoUsage({
      usage: { rolling: { percent: "5" }, weekly: { percent: 1 } },
    }),
    { ok: false, reason: "invalid" },
  );
});

test("normalizeGoUsage accepts a payload without monthly", () => {
  const result = normalizeGoUsage({
    usage: {
      rolling: { status: "ok", percent: 5, resetsAt: "2026-09-10T22:28:25.778Z" },
      weekly: { status: "ok", percent: 2, resetsAt: "2026-09-14T00:00:00.778Z" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.windows.map((window) => window.id),
    ["rolling", "weekly"],
  );
});
