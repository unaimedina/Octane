import assert from "node:assert/strict";
import { test } from "node:test";
import { formatElapsed, formatResetIn } from "./format.ts";

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

test("formatResetIn: expired or invalid reads now", () => {
  assert.equal(formatResetIn(0), "now");
  assert.equal(formatResetIn(-1), "now");
  assert.equal(formatResetIn(Number.NaN), "now");
});

test("formatResetIn: under a minute", () => {
  assert.equal(formatResetIn(30_000), "<1m");
});

test("formatResetIn: minutes", () => {
  assert.equal(formatResetIn(52 * 60_000), "52m");
});

test("formatResetIn: hours and minutes", () => {
  assert.equal(formatResetIn((1 * 60 + 49) * 60_000), "1h 49m");
});

test("formatResetIn: days and hours", () => {
  assert.equal(formatResetIn((2 * 24 + 23) * 60 * 60_000), "2d 23h");
  assert.equal(formatResetIn((23 * 24 + 9) * 60 * 60_000), "23d 9h");
});
