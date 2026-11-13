import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePendingPermissions, normalizePermissionRequest } from "./permissions.ts";
import type { Permission } from "./types.ts";

function permission(id: string, sessionID: string): Permission {
  return {
    id,
    sessionID,
    messageID: "",
    type: "tool",
    title: `Allow ${id}`,
    metadata: {},
    time: { created: 1 },
  };
}

test("normalize: real 2.2.6 list item", () => {
  const item = normalizePermissionRequest({
    id: "per_abc123",
    sessionID: "ses_def456",
    action: "shell",
    resources: ["echo hello-octane"],
    save: ["echo *"],
    source: { type: "tool", messageID: "msg_ghi789", id: "call_jkl012" },
  });
  assert.equal(item?.type, "shell");
  assert.deepEqual(item?.pattern, ["echo hello-octane"]);
  assert.equal(item?.title, "Allow shell");
  assert.equal(item?.metadata.command, "echo hello-octane");
  assert.equal(item?.callID, "call_jkl012");
  assert.equal(item?.messageID, "msg_ghi789");
  assert.equal(item?.sessionID, "ses_def456");
});

test("normalize: live payload keeps title and command", () => {
  const live = normalizePermissionRequest(
    {
      request: {
        id: "per_live",
        sessionID: "ses_live",
        action: "shell",
        resources: ["rm -rf /tmp/octane"],
        title: "Run a shell command",
        message: "wants to run rm",
        messageID: "msg_live",
        metadata: { command: "rm -rf /tmp/octane", description: "cleanup" },
        source: { type: "tool", messageID: "msg_live", callID: "call_live" },
      },
    },
    "ses_fallback",
    1234,
  );
  assert.equal(live?.title, "Run a shell command");
  assert.equal(live?.metadata.command, "rm -rf /tmp/octane");
  assert.equal(live?.metadata.message, "wants to run rm");
  assert.deepEqual(live?.metadata.source, {
    type: "tool",
    messageID: "msg_live",
    callID: "call_live",
  });
  assert.equal(live?.callID, "call_live");
  assert.equal(live?.time.created, 1234);
});

test("normalize: falls back to the fallback session and the default title", () => {
  const item = normalizePermissionRequest({ id: "per_1", action: "edit" }, "ses_1", 7);
  assert.equal(item?.sessionID, "ses_1");
  assert.equal(item?.title, "Allow edit");
  assert.equal(item?.pattern, undefined);
});

test("normalize: null without id or sessionID", () => {
  assert.equal(normalizePermissionRequest({ sessionID: "ses_1" }), null);
  assert.equal(normalizePermissionRequest({ id: "per_1" }), null);
  assert.equal(normalizePermissionRequest(null, "ses_1"), null);
});

test("merge: appends fetched in-scope items after existing ones", () => {
  const a = permission("a", "s1");
  const b = permission("b", "s1");
  const merged = mergePendingPermissions({
    current: [permission("z", "s0"), a],
    fetched: [a, b],
    scope: new Set(["s1"]),
    liveArrivals: new Map(),
    now: 10_000,
  });
  assert.deepEqual(merged.map((item) => item.id), ["z", "a", "b"]);
});

test("merge: drops in-scope items the server no longer lists", () => {
  const merged = mergePendingPermissions({
    current: [permission("a", "s1")],
    fetched: [],
    scope: new Set(["s1"]),
    liveArrivals: new Map(),
    now: 10_000,
  });
  assert.deepEqual(merged, []);
});

test("merge: keeps out-of-scope items untouched", () => {
  const a = permission("a", "s1");
  const merged = mergePendingPermissions({
    current: [a, permission("b", "s2")],
    fetched: [],
    scope: new Set(["s2"]),
    liveArrivals: new Map(),
    now: 10_000,
  });
  assert.deepEqual(merged.map((item) => item.id), ["a"]);
});

test("merge: keeps a live arrival within the grace period, drops it after", () => {
  const input = {
    current: [permission("a", "s1")],
    fetched: [],
    scope: new Set(["s1"]),
    liveArrivals: new Map([["a", 9_000]]),
    now: 12_000,
  };
  assert.deepEqual(
    mergePendingPermissions(input).map((item) => item.id),
    ["a"],
  );
  assert.deepEqual(
    mergePendingPermissions({ ...input, now: 20_000 }).map((item) => item.id),
    [],
  );
});

test("merge: never duplicates ids", () => {
  const a = permission("a", "s1");
  const merged = mergePendingPermissions({
    current: [a],
    fetched: [a, permission("b", "s1")],
    scope: new Set(["s1"]),
    liveArrivals: new Map(),
    now: 10_000,
  });
  assert.deepEqual(merged.map((item) => item.id), ["a", "b"]);
});
