import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnswers,
  formToQuestionRequest,
  toFormAnswer,
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

const form = {
  id: "frm_1", sessionID: "ses_1", title: "Questions",
  metadata: { kind: "question", tool: { messageID: "msg_1", id: "call_1" } },
  fields: [
    { key: "q0", title: "Test", description: "¿Te gusta?", type: "string", custom: true,
      options: [{ value: "Sí", label: "Sí", description: "Primera" }, { value: "No", label: "No", description: "Segunda" }] },
    { key: "q1", title: "Colores", description: "¿Cuáles?", type: "multiselect", custom: true,
      options: [{ value: "Rojo", label: "Rojo" }, { value: "Azul", label: "Azul" }] },
  ],
};

test("formToQuestionRequest converts a question form", () => {
  const r = formToQuestionRequest(form)!;
  assert.equal(r.id, "frm_1");
  assert.equal(r.sessionID, "ses_1");
  assert.equal(r.questions.length, 2);
  const q0 = r.questions[0];
  assert.equal(q0.key, "q0");
  assert.equal(q0.header, "Test");
  assert.equal(q0.question, "¿Te gusta?");
  assert.equal(q0.multiple, false);
  assert.equal(q0.custom, true);
  assert.equal(q0.options.length, 2);
  assert.equal(r.questions[1].multiple, true);
  assert.deepEqual(r.tool, { messageID: "msg_1", callID: "call_1" });
});

test("formToQuestionRequest unwraps { form }", () => {
  assert.deepEqual(formToQuestionRequest({ form }), formToQuestionRequest(form));
});

test("formToQuestionRequest rejects unsupported forms", () => {
  const withField = (f: unknown) => ({ ...form, fields: [f] });
  assert.equal(formToQuestionRequest(withField({ key: "a", type: "boolean" })), null);
  assert.equal(
    formToQuestionRequest(
      withField({ key: "a", type: "string", when: [{ key: "q0", op: "eq", value: "Sí" }] }),
    ),
    null,
  );
  assert.equal(formToQuestionRequest({ ...form, id: undefined }), null);
  assert.equal(formToQuestionRequest({ ...form, fields: [] }), null);
});

test("formToQuestionRequest accepts a plain string field", () => {
  const r = formToQuestionRequest({ ...form, fields: [{ key: "q0", type: "string" }] })!;
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].options.length, 0);
  assert.equal(r.questions[0].custom, true);
});

test("toFormAnswer maps answers to form values", () => {
  const r = formToQuestionRequest(form)!;
  assert.deepEqual(toFormAnswer(r, [["Sí"], ["Rojo", "verde"]]), {
    q0: "Sí",
    q1: ["Rojo", "verde"],
  });
  const y = formToQuestionRequest({
    ...form,
    fields: [{ key: "q0", type: "string", options: [{ value: "y", label: "Yes" }] }],
  })!;
  assert.deepEqual(toFormAnswer(y, [["Yes"]]), { q0: "y" });
  assert.equal(toFormAnswer(r, [["Sí"]]), null);
});
