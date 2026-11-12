import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnswers,
  normalizeQuestionRequest,
  toggleOption,
  validateAnswers,
  type QuestionInfo,
  type QuestionRequest,
} from "./questions.ts";

const single: QuestionInfo = {
  question: "Colour?",
  header: "Colour",
  options: [
    { label: "Red", description: "r" },
    { label: "Blue", description: "b" },
  ],
};
const multi: QuestionInfo = { ...single, multiple: true };
const req = (questions: QuestionInfo[]): QuestionRequest => ({
  id: "q1",
  sessionID: "s1",
  questions,
});

test("normalize: valid object", () => {
  const r = normalizeQuestionRequest({
    id: "q1",
    sessionID: "s1",
    questions: [
      { question: "Q?", header: "H", options: [{ label: "A", description: "d" }], multiple: true },
    ],
    tool: { messageID: "m", callID: "c" },
  });
  assert.equal(r?.id, "q1");
  assert.equal(r?.questions[0].multiple, true);
  assert.deepEqual(r?.tool, { messageID: "m", callID: "c" });
});

test("normalize: request wrapper", () => {
  const r = normalizeQuestionRequest({
    request: { id: "q1", sessionID: "s1", questions: [{ question: "Q?", options: [] }] },
  });
  assert.equal(r?.sessionID, "s1");
  assert.equal(r?.questions[0].header, "");
});

test("normalize: missing id", () => {
  assert.equal(
    normalizeQuestionRequest({ sessionID: "s", questions: [{ question: "Q" }] }),
    null,
  );
});

test("normalize: options without label dropped", () => {
  const r = normalizeQuestionRequest({
    id: "a",
    sessionID: "b",
    questions: [{ question: "Q", options: [{ description: "x" }, { label: "ok" }] }],
  });
  assert.deepEqual(r?.questions[0].options, [{ label: "ok", description: "" }]);
});

test("normalize: all questions invalid", () => {
  assert.equal(
    normalizeQuestionRequest({ id: "a", sessionID: "b", questions: [{ question: "" }, 3] }),
    null,
  );
});

test("toggleOption single", () => {
  const d0 = { selected: [], custom: "" };
  const d1 = toggleOption(single, d0, "Red");
  assert.deepEqual(d1.selected, ["Red"]);
  assert.deepEqual(d0.selected, []);
  assert.deepEqual(toggleOption(single, d1, "Red").selected, []);
  assert.deepEqual(toggleOption(single, d1, "Blue").selected, ["Blue"]);
});

test("toggleOption multiple", () => {
  const d1 = toggleOption(multi, { selected: [], custom: "" }, "Red");
  const d2 = toggleOption(multi, d1, "Blue");
  assert.deepEqual(d2.selected, ["Red", "Blue"]);
  assert.deepEqual(toggleOption(multi, d2, "Red").selected, ["Blue"]);
});

test("buildAnswers", () => {
  assert.deepEqual(buildAnswers(req([single]), [{ selected: ["Red"], custom: "" }]), [["Red"]]);
  assert.deepEqual(
    buildAnswers(req([multi]), [{ selected: ["Red", "Blue"], custom: "" }]),
    [["Red", "Blue"]],
  );
  assert.deepEqual(
    buildAnswers(req([single]), [{ selected: ["Red"], custom: " mine " }]),
    [["mine"]],
  );
  assert.deepEqual(
    buildAnswers(req([multi]), [{ selected: ["Red"], custom: "mine" }]),
    [["Red", "mine"]],
  );
  assert.deepEqual(
    buildAnswers(req([{ ...single, custom: false }]), [{ selected: ["Red"], custom: "mine" }]),
    [["Red"]],
  );
  assert.equal(
    buildAnswers(req([single, single]), [
      { selected: ["Red"], custom: "" },
      { selected: [], custom: " " },
    ]),
    null,
  );
});

test("validateAnswers", () => {
  assert.deepEqual(validateAnswers([["a"], ["b", "c"]]), [["a"], ["b", "c"]]);
  assert.equal(validateAnswers("x"), null);
  assert.equal(validateAnswers([[1]]), null);
  assert.equal(validateAnswers([[" "]]), null);
  assert.equal(validateAnswers(Array.from({ length: 21 }, () => ["a"])), null);
  assert.equal(validateAnswers([Array.from({ length: 51 }, () => "a")]), null);
});
