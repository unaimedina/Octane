export type QuestionOption = { label: string; description: string; value?: string };
export type QuestionInfo = {
  key?: string;
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

function formOptions(field: Obj): QuestionOption[] {
  const options: QuestionOption[] = [];
  if (!Array.isArray(field.options)) return options;
  for (const o of field.options) {
    const opt = obj(o);
    if (!opt || typeof opt.label !== "string") continue;
    options.push({
      label: opt.label,
      value: typeof opt.value === "string" ? opt.value : opt.label,
      description: typeof opt.description === "string" ? opt.description : "",
    });
  }
  return options;
}

/** Converts an OpenCode form (question tool on 2.2+) into a QuestionRequest. */
export function formToQuestionRequest(value: unknown): QuestionRequest | null {
  let form = obj(value);
  if (!form) return null;
  const wrapped = obj(form.form);
  if (wrapped) form = wrapped;
  const id = form.id;
  const sessionID = form.sessionID;
  if (typeof id !== "string" || !id) return null;
  if (typeof sessionID !== "string" || !sessionID) return null;
  if (!Array.isArray(form.fields) || form.fields.length === 0) return null;

  const questions: QuestionInfo[] = [];
  for (const item of form.fields) {
    const field = obj(item);
    if (!field) return null;
    const key = field.key;
    if (typeof key !== "string" || !key) return null;
    if (field.hidden === true) return null;
    if (Array.isArray(field.when) && field.when.length > 0) return null;
    const options = formOptions(field);
    let multiple: boolean;
    let custom: boolean;
    if (field.type === "string") {
      multiple = false;
      custom = options.length > 0 ? field.custom === true : true;
    } else if (field.type === "multiselect") {
      multiple = true;
      custom = field.custom === true;
      if (options.length === 0 && !custom) return null;
    } else {
      return null;
    }
    const title = typeof field.title === "string" ? field.title : "";
    const question =
      (typeof field.description === "string" && field.description) ||
      title ||
      (typeof form.title === "string" && form.title) ||
      key;
    questions.push({ key, question, header: title, options, multiple, custom });
  }

  const request: QuestionRequest = { id, sessionID, questions };
  const tool = obj(obj(form.metadata)?.tool);
  if (tool && typeof tool.messageID === "string" && typeof tool.id === "string") {
    request.tool = { messageID: tool.messageID, callID: tool.id };
  }
  return request;
}

/** Builds the form answer record from answers in question order. */
export function toFormAnswer(
  request: QuestionRequest,
  answers: string[][],
): Record<string, string | string[]> | null {
  if (answers.length !== request.questions.length) return null;
  const result: Record<string, string | string[]> = {};
  for (let i = 0; i < request.questions.length; i++) {
    const question = request.questions[i];
    if (!question.key) return null;
    const mapped = answers[i].map((text) => {
      const option = question.options.find((o) => o.label === text);
      return option ? (option.value ?? option.label) : text;
    });
    if (question.multiple === true) result[question.key] = mapped;
    else {
      if (mapped.length === 0) return null;
      result[question.key] = mapped[0];
    }
  }
  return result;
}
