import { test } from "node:test";
import assert from "node:assert/strict";
import { isFinishTransition, shouldPlay, soundsEnabled } from "./sound-triggers.ts";

test("isFinishTransition", () => {
  assert.equal(isFinishTransition({ type: "busy" }, { type: "idle" }), true);
  assert.equal(isFinishTransition({ type: "retry" }, { type: "idle" }), true);
  assert.equal(isFinishTransition({ type: "idle" }, { type: "idle" }), false);
  assert.equal(isFinishTransition(undefined, { type: "idle" }), false);
  assert.equal(isFinishTransition({ type: "busy" }, { type: "busy" }), false);
});

test("shouldPlay throttle", () => {
  assert.equal(shouldPlay({}, "done", 1000), true);
  assert.equal(shouldPlay({ done: 1000 }, "done", 1500), false);
  assert.equal(shouldPlay({ done: 1000 }, "done", 2500), true);
  assert.equal(shouldPlay({ done: 1000 }, "attention", 1100), true);
});

test("soundsEnabled", () => {
  assert.equal(soundsEnabled(null), true);
  assert.equal(soundsEnabled("on"), true);
  assert.equal(soundsEnabled("off"), false);
});
