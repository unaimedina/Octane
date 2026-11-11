// Pure parser for improve-style plan files (`plans/NNN-slug.md` plus the
// `plans/README.md` index). No runtime imports: it is unit tested with
// `node --test`.

export type PlanPriority = "P1" | "P2" | "P3";
export type PlanIndexStatus =
  | "TODO"
  | "IN PROGRESS"
  | "DONE"
  | "BLOCKED"
  | "REJECTED"
  | "UNKNOWN";

export type PlanIndexRow = {
  number: string;
  title: string;
  priority?: PlanPriority;
  dependsOn: string[];
  status: PlanIndexStatus;
};

export type PlanFileInfo = {
  number: string;
  title: string;
  priority?: PlanPriority;
  dependsOn: string[];
  why: string;
};

const MAX_WHY = 20_000;
const KNOWN_STATUSES: PlanIndexStatus[] = [
  "IN PROGRESS",
  "TODO",
  "DONE",
  "BLOCKED",
  "REJECTED",
];

/** A standalone three-digit number (not part of a longer token like a hash). */
const PLAN_NUMBER = /(?<![\dA-Za-z.])\d{3}(?![\dA-Za-z])/g;

function planNumbers(text: string, exclude?: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PLAN_NUMBER)) {
    const value = match[0];
    if (value !== exclude && !found.includes(value)) found.push(value);
  }
  return found;
}

function parsePriority(text: string): PlanPriority | undefined {
  const match = /\bP([123])\b/i.exec(text);
  return match ? (`P${match[1]}` as PlanPriority) : undefined;
}

/** Split a markdown table row on unescaped pipes. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\\" && line[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  if (cells.length > 0 && cells[0].trim() === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^[\s|:-]+$/.test(line) && line.includes("-");
}

function parseStatus(cell: string): PlanIndexStatus {
  const text = cell.replace(/[*_`]/g, "").trim().toUpperCase();
  for (const status of KNOWN_STATUSES) {
    if (text === status || text.startsWith(`${status} `) || text.startsWith(`${status}(`)) {
      return status;
    }
  }
  return "UNKNOWN";
}

function columnIndex(headers: string[], ...names: string[]): number {
  const lower = headers.map((header) => header.toLowerCase());
  for (const name of names) {
    const exact = lower.indexOf(name);
    if (exact !== -1) return exact;
  }
  for (const name of names) {
    const partial = lower.findIndex((header) => header.includes(name));
    if (partial !== -1) return partial;
  }
  return -1;
}

export function parsePlanIndex(markdown: string): PlanIndexRow[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  for (let start = 0; start < lines.length; start++) {
    const line = lines[start].trim();
    if (!line.startsWith("|")) continue;
    const headers = splitRow(line);
    const planCol = columnIndex(headers, "plan", "#");
    const statusCol = columnIndex(headers, "status");
    if (planCol === -1 || statusCol === -1) continue;

    const titleCol = columnIndex(headers, "title", "name");
    const priorityCol = columnIndex(headers, "priority");
    const dependsCol = columnIndex(headers, "depends");

    const rows: PlanIndexRow[] = [];
    for (let index = start + 1; index < lines.length; index++) {
      const row = lines[index].trim();
      if (!row.startsWith("|")) break;
      if (isSeparatorRow(row)) continue;
      const cells = splitRow(row);
      const planCell = cells[planCol] ?? "";
      const number = planNumbers(planCell)[0];
      if (!number) continue;
      rows.push({
        number,
        title: titleCol === -1 ? "" : (cells[titleCol] ?? "").trim(),
        priority:
          priorityCol === -1 ? undefined : parsePriority(cells[priorityCol] ?? ""),
        dependsOn:
          dependsCol === -1 ? [] : planNumbers(cells[dependsCol] ?? "", number),
        status: parseStatus(cells[statusCol] ?? ""),
      });
    }
    return rows;
  }
  return [];
}

function listItemValue(markdown: string, label: string): string {
  const pattern = new RegExp(`^\\s*[-*]\\s+\\*\\*${label}\\*\\*\\s*:\\s*(.*)$`, "im");
  return pattern.exec(markdown)?.[1] ?? "";
}

function whySection(markdown: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => /^##\s+Why this matters\s*$/i.test(line.trim()));
  if (start === -1) return "";
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    if (/^##\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join("\n").trim().slice(0, MAX_WHY);
}

export function parsePlanFile(markdown: string, fallbackNumber: string): PlanFileInfo {
  const text = markdown.replace(/\r\n?/g, "\n");
  const planHeading = /^#\s+Plan\s+(\d{3})\s*:\s*(.+)$/m.exec(text);
  let number = fallbackNumber;
  let title = `Plan ${fallbackNumber}`;
  if (planHeading) {
    number = planHeading[1];
    title = planHeading[2].trim();
  } else {
    const heading = /^#\s+(.+)$/m.exec(text);
    if (heading) title = heading[1].trim();
  }
  return {
    number,
    title,
    priority: parsePriority(listItemValue(text, "Priority")),
    dependsOn: planNumbers(listItemValue(text, "Depends on"), number),
    why: whySection(text),
  };
}

export function planTaskPrompt(plansDir: string, fileName: string): string {
  const dir = plansDir.replace(/\/+$/, "");
  return [
    `Execute the implementation plan in \`${dir}/${fileName}\`.`,
    "Read the whole file before changing anything. Follow its executor",
    "instructions, drift check, steps, verification commands and STOP conditions",
    "exactly. Work only on this plan. When finished, update this plan's row in",
    `\`${dir}/README.md\`.`,
  ].join("\n");
}
