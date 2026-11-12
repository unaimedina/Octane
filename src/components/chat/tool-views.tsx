"use client";

import * as React from "react";
import hljs from "highlight.js/lib/common";
import { Check, Copy, ExternalLink, FileText, Folder } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/chat/markdown";
import { parseGlobOutput, parseGrepOutput, parseReadOutput, shortPath } from "@/lib/tool-output";
import type { ToolPart } from "@/lib/types";
import { cn } from "@/lib/utils";

type ViewProps = { part: ToolPart; root?: string };

const MAX_TEXT = 20_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function inputOf(part: ToolPart): Record<string, unknown> {
  return asRecord(part.state.input);
}

function metaOf(part: ToolPart): Record<string, unknown> {
  return asRecord("metadata" in part.state ? part.state.metadata : undefined);
}

function outputOf(part: ToolPart): string {
  return part.state.status === "completed" ? (part.state.output ?? "") : "";
}

const smallCaps =
  "text-[11px] text-muted-foreground";
const codeBox =
  "scrollbar-thin overflow-auto rounded-md border border-border/60 bg-muted/40 font-mono text-[11px] leading-relaxed";

const languageByExtension: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  md: "markdown",
  yml: "yaml",
  sh: "bash",
  ps1: "powershell",
};

function languageFor(file: string): string | undefined {
  const match = /\.([A-Za-z0-9]+)$/.exec(file);
  if (!match) return undefined;
  const ext = match[1].toLowerCase();
  const language = languageByExtension[ext] ?? ext;
  return hljs.getLanguage(language) ? language : undefined;
}

function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Could not copy the path");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Copy file path"
      title="Copy path"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

export function ReadView({ part, root }: ViewProps) {
  const input = inputOf(part);
  const parsed = parseReadOutput(outputOf(part));
  if (!parsed) return null;
  const path = str(input.path) || str(input.filePath) || str(input.file_path) || parsed.file || "";
  const language = languageFor(path);
  const shown = parsed.lines.slice(0, 400);
  const hidden = parsed.lines.length - shown.length;
  const truncated = metaOf(part).truncated === true;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <FileText className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate" title={path}>
          {shortPath(path, root) || path}
        </span>
        {path ? <CopyPath path={path} /> : null}
      </div>
      <div className={cn(codeBox, "max-h-96")}>
        <table className="w-full border-collapse">
          <tbody>
            {shown.map((line) => (
              <tr key={line.n}>
                <td className="select-none whitespace-nowrap pr-3 pl-2 text-right align-top text-muted-foreground/50">
                  {line.n}
                </td>
                {language ? (
                  <td
                    className="whitespace-pre pr-2"
                    dangerouslySetInnerHTML={{
                      __html: hljs.highlight(line.text, { language, ignoreIllegals: true }).value,
                    }}
                  />
                ) : (
                  <td className="whitespace-pre pr-2">{line.text}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 ? (
        <div className="text-[10px] text-muted-foreground">… {hidden} more lines</div>
      ) : null}
      {truncated ? (
        <div className="text-[10px] text-muted-foreground">Output was truncated.</div>
      ) : null}
    </div>
  );
}

function Highlighted({ text, pattern }: { text: string; pattern: string }) {
  let regex: RegExp | null = null;
  try {
    regex = pattern ? new RegExp(pattern, "gi") : null;
  } catch {
    regex = null;
  }
  if (!regex) return <>{text}</>;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = regex.exec(text)) && guard++ < 200) {
    if (match[0].length === 0) {
      regex.lastIndex++;
      continue;
    }
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <mark key={match.index} className="rounded-sm bg-warning/25 text-foreground">
        {match[0]}
      </mark>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

function GrepFileRow({
  file,
  matches,
  root,
  pattern,
}: {
  file: string;
  matches: { line: number; text: string }[];
  root?: string;
  pattern: string;
}) {
  const [all, setAll] = React.useState(false);
  const visible = all ? matches : matches.slice(0, 8);
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={file}>
          {shortPath(file, root) || file}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[9px]">{matches.length}</span>
      </div>
      <div className="scrollbar-thin overflow-x-auto font-mono text-[11px] leading-relaxed">
        {visible.map((match, index) => (
          <div key={`${match.line}-${index}`} className="flex gap-2 px-2.5">
            <span className="w-10 shrink-0 select-none text-right text-muted-foreground/50">
              {match.line}
            </span>
            <span className="select-none text-border">│</span>
            <span className="whitespace-pre">
              <Highlighted text={match.text} pattern={pattern} />
            </span>
          </div>
        ))}
      </div>
      {matches.length > 8 && !all ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full border-t border-border/60 px-2.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
        >
          Show {matches.length - 8} more
        </button>
      ) : null}
    </div>
  );
}

export function GrepView({ part, root }: ViewProps) {
  const input = inputOf(part);
  const parsed = parseGrepOutput(outputOf(part));
  const pattern = str(input.pattern);
  if (!parsed) return null;
  const include = str(input.include);
  const files = parsed.files.slice(0, 50);
  const hiddenFiles = parsed.files.length - files.length;

  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] text-muted-foreground">
        “{pattern}”{include ? ` · ${include}` : ""}
      </div>
      {files.length === 0 ? (
        <div className="text-xs text-muted-foreground">No matches.</div>
      ) : null}
      {files.map((entry) => (
        <GrepFileRow
          key={entry.file}
          file={entry.file}
          matches={entry.matches}
          root={root}
          pattern={pattern}
        />
      ))}
      {hiddenFiles > 0 ? (
        <div className="text-[10px] text-muted-foreground">… {hiddenFiles} more files</div>
      ) : null}
    </div>
  );
}

export function GlobView({ part, root }: ViewProps) {
  const input = inputOf(part);
  const paths = parseGlobOutput(outputOf(part));
  if (paths.length === 0) return null;
  const shown = paths.slice(0, 200);
  const pattern = str(input.pattern);
  return (
    <div className="space-y-1.5">
      {pattern ? <div className="font-mono text-[11px] text-muted-foreground">{pattern}</div> : null}
      <ul className={cn(codeBox, "max-h-80 space-y-px p-2")}>
        {shown.map((path) => (
          <li key={path} className="flex items-center gap-1.5">
            <Folder className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="truncate" title={path}>
              {shortPath(path, root) || path}
            </span>
          </li>
        ))}
      </ul>
      {paths.length > shown.length ? (
        <div className="text-[10px] text-muted-foreground">… {paths.length - shown.length} more</div>
      ) : null}
    </div>
  );
}

export function WebView({ part }: ViewProps) {
  const input = inputOf(part);
  const output = outputOf(part);
  if (!output) return null;
  const url = str(input.url);
  const query = str(input.query);
  const safeUrl = /^https?:\/\//i.test(url) ? url : "";
  return (
    <div className="space-y-1.5">
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 font-mono text-[11px] text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{safeUrl}</span>
        </a>
      ) : query ? (
        <div className="font-mono text-[11px] text-muted-foreground">“{query}”</div>
      ) : null}
      <div className="scrollbar-thin max-h-80 overflow-auto rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs">
        <Markdown text={output.length > MAX_TEXT ? `${output.slice(0, MAX_TEXT)}\n… truncated` : output} />
      </div>
    </div>
  );
}

export function QuestionView({ part }: ViewProps) {
  const input = inputOf(part);
  const questions = Array.isArray(input.questions) ? input.questions.map(asRecord) : [];
  if (questions.length === 0) return null;
  const answers = Array.isArray(metaOf(part).answers) ? (metaOf(part).answers as unknown[]) : [];
  return (
    <div className="space-y-3">
      {questions.map((question, index) => {
        const chosen = Array.isArray(answers[index])
          ? (answers[index] as unknown[]).filter((value): value is string => typeof value === "string")
          : [];
        const options = Array.isArray(question.options) ? question.options.map(asRecord) : [];
        return (
          <div key={index} className="space-y-1">
            {str(question.header) ? <div className={smallCaps}>{str(question.header)}</div> : null}
            <div className="text-xs">{str(question.question)}</div>
            <ul className="space-y-0.5">
              {options.map((option, optionIndex) => {
                const label = str(option.label);
                const selected = chosen.includes(label);
                return (
                  <li
                    key={optionIndex}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      selected ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {selected ? (
                      <Check className="size-3 shrink-0 text-success" />
                    ) : (
                      <span className="size-3 shrink-0" />
                    )}
                    {label}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function SkillView({ part }: ViewProps) {
  const input = inputOf(part);
  const meta = metaOf(part);
  const name = str(input.id) || str(input.name) || str(meta.name);
  const directory = str(meta.directory);
  const output = outputOf(part);
  if (!name && !output) return null;
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[11px]">{name}</div>
      {directory ? (
        <div className="truncate font-mono text-[10px] text-muted-foreground" title={directory}>
          {directory}
        </div>
      ) : null}
      {output ? (
        <details className="rounded-md border border-border/60 bg-muted/20">
          <summary className={cn("cursor-pointer list-none px-2.5 py-1.5", smallCaps)}>
            Skill instructions
          </summary>
          <pre className="scrollbar-thin max-h-80 overflow-auto border-t border-border/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
            {output.length > MAX_TEXT ? `${output.slice(0, MAX_TEXT)}\n… truncated` : output}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** Pick the specialised view for a tool, or null when the generic body should be used. */
export function SpecialisedToolView({ part, root }: ViewProps): React.ReactElement | null {
  const tool = part.tool.toLowerCase();
  if (tool === "read") return <ReadView part={part} root={root} />;
  if (tool === "grep") return <GrepView part={part} root={root} />;
  if (tool === "glob" || tool === "list") return <GlobView part={part} root={root} />;
  if (tool === "webfetch" || tool === "websearch") return <WebView part={part} root={root} />;
  if (tool === "question") return <QuestionView part={part} root={root} />;
  if (tool === "skill") return <SkillView part={part} root={root} />;
  return null;
}

/** Whether a specialised view would render something for this part (parsers succeed). */
export function hasSpecialisedView(part: ToolPart): boolean {
  if (part.state.status !== "completed") return false;
  const tool = part.tool.toLowerCase();
  const output = outputOf(part);
  switch (tool) {
    case "read":
      return parseReadOutput(output) !== null;
    case "grep":
      return parseGrepOutput(output) !== null;
    case "glob":
    case "list":
      return parseGlobOutput(output).length > 0;
    case "webfetch":
    case "websearch":
      return output.length > 0;
    case "question":
      return Array.isArray(inputOf(part).questions) && (inputOf(part).questions as unknown[]).length > 0;
    case "skill":
      return Boolean(str(inputOf(part).id) || str(inputOf(part).name) || str(metaOf(part).name) || output);
    default:
      return false;
  }
}
