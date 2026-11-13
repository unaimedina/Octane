import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPendingInput } from "./pending-input.ts";

const perm = (id: string, sessionID: string) => ({ id, sessionID });
const question = (id: string, sessionID: string) => ({ id, sessionID });

test("question shows while the open session has an inline permission", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s1")],
    questions: [question("q1", "s1")],
    openSessionId: "s1",
    arrival: { p1: 1, q1: 2 },
    shownId: null,
  });
  assert.deepEqual(pick.modal, { kind: "question", id: "q1" });
  assert.equal(pick.inlinePermissionId, "p1");
  assert.equal(pick.waiting, 0);
});

test("earliest candidate wins: permission before question", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s2")],
    questions: [question("q1", "s1")],
    openSessionId: "s1",
    arrival: { p1: 1, q1: 2 },
    shownId: null,
  });
  assert.deepEqual(pick.modal, { kind: "permission", id: "p1" });
  assert.equal(pick.waiting, 1);
});

test("earliest candidate wins: question before permission", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s2")],
    questions: [question("q1", "s1")],
    openSessionId: "s1",
    arrival: { p1: 2, q1: 1 },
    shownId: null,
  });
  assert.deepEqual(pick.modal, { kind: "question", id: "q1" });
  assert.equal(pick.waiting, 1);
});

test("a shown modal stays when an older candidate appears", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s2")],
    questions: [question("q1", "s1")],
    openSessionId: "s1",
    arrival: { p1: 1, q1: 2 },
    shownId: "q1",
  });
  assert.deepEqual(pick.modal, { kind: "question", id: "q1" });
  assert.equal(pick.waiting, 1);
});

test("a shown id that is no longer pending falls back to the earliest", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s2")],
    questions: [],
    openSessionId: "s1",
    arrival: { p1: 1 },
    shownId: "gone",
  });
  assert.deepEqual(pick.modal, { kind: "permission", id: "p1" });
});

test("four candidates leave three waiting", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s2"), perm("p2", "s3")],
    questions: [question("q1", "s1"), question("q2", "s2")],
    openSessionId: "s1",
    arrival: { p1: 1, p2: 2, q1: 3, q2: 4 },
    shownId: null,
  });
  assert.deepEqual(pick.modal, { kind: "permission", id: "p1" });
  assert.equal(pick.waiting, 3);
});

test("without an open session every permission is a modal candidate", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s1")],
    questions: [],
    openSessionId: undefined,
    arrival: { p1: 1 },
    shownId: null,
  });
  assert.deepEqual(pick.modal, { kind: "permission", id: "p1" });
  assert.equal(pick.inlinePermissionId, null);
});

test("needsInput is the union across both kinds", () => {
  const pick = pickPendingInput({
    permissions: [perm("p1", "s1")],
    questions: [question("q1", "s2")],
    openSessionId: "s1",
    arrival: { p1: 1, q1: 2 },
    shownId: null,
  });
  assert.deepEqual([...pick.needsInput].sort(), ["s1", "s2"]);
});

test("empty input has no modal and nothing waiting", () => {
  const pick = pickPendingInput({
    permissions: [],
    questions: [],
    openSessionId: "s1",
    arrival: {},
    shownId: null,
  });
  assert.equal(pick.modal, null);
  assert.equal(pick.waiting, 0);
  assert.equal(pick.inlinePermissionId, null);
  assert.equal(pick.needsInput.size, 0);
});
