export type QuestionOption = { label: string; description: string };
export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};
export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
};
/** Per question: selected option labels plus an optional custom answer. */
export type QuestionDraft = { selected: string[]; custom: string };

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : null;
}

export function normalizeQuestionRequest(value: unknown): QuestionRequest | null {
  let source = obj(value);
  if (!source) return null;
  const wrapped = obj(source.request);
  if (wrapped) source = wrapped;
  const id = source.id;
  const sessionID = source.sessionID;
  if (typeof id !== "string" || !id) return null;
  if (typeof sessionID !== "string" || !sessionID) return null;
  if (!Array.isArray(source.questions)) return null;

  const questions: QuestionInfo[] = [];
  for (const item of source.questions) {
    const q = obj(item);
    if (!q || typeof q.question !== "string" || !q.question) continue;
    const options: QuestionOption[] = [];
    if (Array.isArray(q.options)) {
      for (const o of q.options) {
        const opt = obj(o);
        if (!opt || typeof opt.label !== "string") continue;
        options.push({
          label: opt.label,
          description: typeof opt.description === "string" ? opt.description : "",
        });
      }
    }
    const info: QuestionInfo = {
      question: q.question,
      header: typeof q.header === "string" ? q.header : "",
      options,
    };
    if (typeof q.multiple === "boolean") info.multiple = q.multiple;
    if (typeof q.custom === "boolean") info.custom = q.custom;
    questions.push(info);
  }
  if (questions.length === 0) return null;

  const request: QuestionRequest = { id, sessionID, questions };
  const tool = obj(source.tool);
  if (tool && typeof tool.messageID === "string" && typeof tool.callID === "string") {
    request.tool = { messageID: tool.messageID, callID: tool.callID };
  }
  return request;
}

export function allowsCustom(info: QuestionInfo): boolean {
  return info.custom !== false;
}

export function emptyDrafts(request: QuestionRequest): QuestionDraft[] {
  return request.questions.map(() => ({ selected: [], custom: "" }));
}

export function toggleOption(
  info: QuestionInfo,
  draft: QuestionDraft,
  label: string,
): QuestionDraft {
  if (info.multiple === true) {
    const selected = draft.selected.includes(label)
      ? draft.selected.filter((item) => item !== label)
      : [...draft.selected, label];
    return { ...draft, selected };
  }
  const only = draft.selected.length === 1 && draft.selected[0] === label;
  return { ...draft, selected: only ? [] : [label] };
}

export function buildAnswers(
  request: QuestionRequest,
  drafts: QuestionDraft[],
): string[][] | null {
  const answers: string[][] = [];
  for (let i = 0; i < request.questions.length; i++) {
    const question = request.questions[i];
    const draft = drafts[i] ?? { selected: [], custom: "" };
    let answer = [...draft.selected];
    const custom = draft.custom.trim();
    if (allowsCustom(question) && custom) {
      answer = question.multiple === true ? [...answer, custom] : [custom];
    }
    if (answer.length === 0) return null;
    answers.push(answer);
  }
  return answers;
}

export function validateAnswers(value: unknown): string[][] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const result: string[][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length > 50) return null;
    const answer: string[] = [];
    for (const text of entry) {
      if (typeof text !== "string") return null;
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 2000) return null;
      answer.push(text);
    }
    result.push(answer);
  }
  return result;
}
