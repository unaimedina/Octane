import assert from "node:assert/strict";
import { test } from "node:test";
import { formatElapsed } from "./format.ts";

test("formatElapsed: zero", () => {
  assert.equal(formatElapsed(0), "0.0s");
});

test("formatElapsed: sub-second rounds down", () => {
  assert.equal(formatElapsed(950), "0.9s");
});

test("formatElapsed: seconds with one decimal", () => {
  assert.equal(formatElapsed(12_400), "12.4s");
});

test("formatElapsed: minutes pad seconds", () => {
  assert.equal(formatElapsed(185_000), "3m 05s");
});

test("formatElapsed: hours and minutes", () => {
  assert.equal(formatElapsed(4_320_000), "1h 12m");
});

test("formatElapsed: negative or invalid input is zero", () => {
  assert.equal(formatElapsed(-5), "0.0s");
  assert.equal(formatElapsed(Number.NaN), "0.0s");
});
