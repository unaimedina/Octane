"use client";

import * as React from "react";
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Copy,
  FilePen,
  FileText,
  Globe,
  ListTodo,
  Loader2,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { DiffView } from "@/components/chat/diff-view";
import { OpenCodeSubagentView } from "@/components/chat/opencode-subagent";
import { SpecialisedToolView, hasSpecialisedView } from "@/components/chat/tool-views";
import { Button } from "@/components/ui/button";
import { describeTool, exploreSummary, sentenceText } from "@/lib/tool-activity";
import type { ToolKind } from "@/lib/tool-activity";
import type { ToolPart } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindIcons: Record<ToolKind, LucideIcon> = {
  read: FileText,
  search: Search,
  files: Search,
  edit: FilePen,
  write: FilePen,
  shell: Terminal,
  web: Globe,
  skill: BookOpen,
  question: CircleHelp,
  todo: ListTodo,
  script: Terminal,
  agent: Bot,
  other: Wrench,
};

export const ToolRootContext = React.createContext<string | undefined>(undefined);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

type EditPreview = { file?: string; before: string; after: string };

/** Turn edit/write inputs into a visual before/after diff. */
function editPreviews(part: ToolPart): EditPreview[] {
  const input = asRecord(part.state.input);
  const file =
    typeof input.file_path === "string"
      ? input.file_path
      : typeof input.filePath === "string"
        ? input.filePath
        : typeof input.path === "string"
          ? input.path
          : undefined;
  const tool = part.tool.toLowerCase();

  if (tool === "edit") {
    // Support old_string/new_string and oldString/newString tool inputs.
    const before =
      typeof input.old_string === "string"
        ? input.old_string
        : typeof input.oldString === "string"
          ? input.oldString
          : "";
    const after =
      typeof input.new_string === "string"
        ? input.new_string
        : typeof input.newString === "string"
          ? input.newString
          : "";
    return before || after ? [{ file, before, after }] : [];
  }

  if (tool === "write" || tool === "create") {
    const after =
      typeof input.content === "string"
        ? input.content
        : typeof input.file_text === "string"
          ? input.file_text
          : "";
    return after ? [{ file, before: "", after }] : [];
  }

  if (tool === "multiedit" || tool === "multi_edit") {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return edits
      .map((value) => {
        const edit = asRecord(value);
        return {
          file,
          before:
            typeof edit.old_string === "string"
              ? edit.old_string
              : typeof edit.oldString === "string"
                ? edit.oldString
                : "",
          after:
            typeof edit.new_string === "string"
              ? edit.new_string
              : typeof edit.newString === "string"
                ? edit.newString
                : "",
        };
      })
      .filter((edit) => edit.before || edit.after);
  }

  return [];
}

export const ToolCallPart = React.memo(function ToolCallPart({
  part,
}: {
  part: ToolPart;
}) {
  const tool = part.tool.toLowerCase();
  if (tool === "subagent" || tool === "task" || tool === "agent") {
    return <OpenCodeSubagentView part={part} />;
  }
  if (tool === "bash" || tool === "shell" || tool === "terminal") {
    return <ShellCard part={part} />;
  }
  return <ToolCard part={part} />;
});

function ShellCard({ part }: { part: ToolPart }) {
  const state = part.state;
  const input = asRecord(state.input);
  const command =
    (typeof input.command === "string" && input.command) ||
    (typeof input.cmd === "string" && input.cmd) ||
    (typeof input.script === "string" && input.script) ||
    part.tool;
  const root = React.useContext(ToolRootContext);
  const description =
    typeof input.description === "string" && input.description.trim()
      ? input.description
      : sentenceText(describeTool(part, root));
  const metadata = asRecord("metadata" in state ? state.metadata : undefined);
  const exitCode =
    typeof metadata.exit === "number"
      ? metadata.exit
      : typeof metadata.exitCode === "number"
        ? metadata.exitCode
        : undefined;
  const running = state.status === "running" || state.status === "pending";
  const failed = state.status === "error";
  const output =
    state.status === "completed"
      ? state.output
      : state.status === "error"
        ? state.error
        : state.status === "running"
          ? undefined
          : state.raw;
  const [open, setOpen] = React.useState(failed);
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        [command, output].filter(Boolean).join("\n\n"),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Could not copy the output");
    }
  }

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-card/40 transition-colors",
        failed ? "border-destructive/30" : "border-border/80",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
        aria-expanded={open}
      >
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-muted/60",
            failed && "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : failed ? (
            <CircleAlert className="size-3.5" />
          ) : (
            <Terminal className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="shrink-0 font-mono text-[11px] text-success dark:text-success">
              $
            </span>
            <span className="truncate font-mono text-[11px]">{command}</span>
          </span>
          {description ? (
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-px font-mono text-[9px] uppercase tracking-wider",
            running && "bg-info/10 text-info dark:text-info",
            failed && "bg-destructive/10 text-destructive",
            !running && !failed && "bg-success/10 text-success dark:text-success",
          )}
        >
          {running
            ? "running"
            : failed
              ? "failed"
              : exitCode !== undefined
                ? `exit ${exitCode}`
                : "completed"}
        </span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-border/60 bg-[#090d12]">
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#a1a7b3]">
              <Terminal className="size-3" /> Terminal
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-[#a1a7b3] hover:bg-white/10 hover:text-[#f8fafc]"
              onClick={() => void copy()}
              disabled={!output && !command}
              aria-label="Copy shell command and output"
              title="Copy command and output"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
          </div>
          <pre className="scrollbar-thin max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-[#f8fafc]">
            <span className="text-success">$ </span>
            {command}
            {"\n\n"}
            {running && !output
              ? "Running…"
              : output
                ? output.length > 20_000
                  ? `${output.slice(0, 20_000)}\n… truncated`
                  : output
                : "No output."}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function RawDetails({ label, text, tone }: { label: string; text: string; tone?: "error" }) {
  return (
    <details className="rounded-md border border-border/60 bg-muted/20">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {label}
      </summary>
      <pre
        className={cn(
          "scrollbar-thin max-h-56 overflow-auto border-t border-border/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
          tone === "error" && "text-destructive",
        )}
      >
        {text.length > 20_000 ? `${text.slice(0, 20_000)}\n… truncated` : text}
      </pre>
    </details>
  );
}

function ToolCard({ part }: { part: ToolPart }) {
  const root = React.useContext(ToolRootContext);
  const [open, setOpen] = React.useState(part.state.status === "error");
  const state = part.state;
  const running = state.status === "running" || state.status === "pending";
  const failed = state.status === "error";
  const sentence = React.useMemo(() => describeTool(part, root), [part, root]);
  const Icon = kindIcons[sentence.kind] ?? Wrench;
  const fullText = sentenceText(sentence);

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-card/40 transition-colors",
        failed ? "border-destructive/30" : "border-border/80",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
        aria-expanded={open}
        title={fullText}
      >
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-muted/60",
            failed && "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : failed ? (
            <CircleAlert className="size-3.5" />
          ) : (
            <Icon className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="shrink-0 text-xs text-foreground/90">{sentence.verb}</span>
          {sentence.target ? (
            <span className="truncate font-mono text-[11px]">{sentence.target}</span>
          ) : null}
          {sentence.detail ? (
            <span
              className={cn(
                "shrink-0 text-[11px] text-muted-foreground",
                failed && "max-w-[40%] truncate text-destructive/80",
              )}
            >
              · {sentence.detail}
            </span>
          ) : null}
        </span>
        {running ? (
          <span className="size-1.5 shrink-0 rounded-full bg-info pulse-dot" />
        ) : failed ? (
          <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
        ) : null}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open ? <ToolCardBody part={part} root={root} target={sentence.target} /> : null}
    </div>
  );
}

function ToolCardBody({
  part,
  root,
  target,
}: {
  part: ToolPart;
  root?: string;
  target: string;
}) {
  const state = part.state;
  const failed = state.status === "error";
  const edits = React.useMemo(() => editPreviews(part), [part]);
  const specialised = React.useMemo(() => hasSpecialisedView(part), [part]);
  const metadata = asRecord("metadata" in state ? state.metadata : undefined);
  const diff =
    typeof metadata.diff === "string"
      ? metadata.diff
      : typeof metadata.patch === "string"
        ? metadata.patch
        : undefined;
  const output =
    state.status === "completed"
      ? state.output
      : state.status === "error"
        ? state.error
        : state.status === "running"
          ? undefined
          : state.raw;
  const rawInput = JSON.stringify(state.input, null, 2);

  return (
    <div className="space-y-3 border-t border-border/60 bg-background/40 px-3 py-3">
      {specialised ? (
        <>
          <SpecialisedToolView part={part} root={root} />
          <RawDetails label="Raw input" text={rawInput} />
          {output ? <RawDetails label="Raw output" text={output} /> : null}
        </>
      ) : (
        <>
          {edits.length > 0 ? (
            <div className="space-y-2">
              {edits.map((edit, index) => (
                <div
                  key={`${edit.file ?? "file"}-${index}`}
                  className="overflow-hidden rounded-lg border border-border/60"
                >
                  <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                    <FilePen className="size-3" />
                    <span className="truncate">{edit.file ?? target}</span>
                  </div>
                  <DiffView
                    before={edit.before}
                    after={edit.after}
                    file={edit.file ?? target}
                  />
                </div>
              ))}
            </div>
          ) : diff ? (
            <DiffView diff={diff} file={target} />
          ) : null}

          <RawDetails label="Raw input" text={rawInput} />

          {output ? (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                {failed ? "Error" : "Output"}
              </div>
              <pre
                className={cn(
                  "scrollbar-thin max-h-80 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
                  failed && "border-destructive/30 bg-destructive/5 text-destructive",
                )}
              >
                {output.length > 20_000 ? `${output.slice(0, 20_000)}\n… truncated` : output}
              </pre>
            </div>
          ) : null}
        </>
      )}

      {state.status === "completed" && state.attachments?.length ? (
        <div className="flex flex-wrap gap-2">
          {state.attachments.map((attachment) =>
            attachment.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={attachment.id}
                src={attachment.url}
                alt={attachment.filename ?? "attachment"}
                className="max-h-56 rounded-lg border border-border object-contain"
              />
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ExploreGroup({ parts }: { parts: ToolPart[] }) {
  const summary = React.useMemo(() => exploreSummary(parts), [parts]);
  const failed = parts.some((part) => part.state.status === "error");
  const [open, setOpen] = React.useState(failed);

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-card/40 transition-colors",
        failed ? "border-destructive/30" : "border-border/80",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
        aria-expanded={open}
        title={summary.text}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-muted/60">
          {summary.running ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Search className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{summary.text}</span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-1 border-t border-border/60 bg-background/40 p-2 [&>div]:my-0">
          {parts.map((part) => (
            <ToolCallPart key={part.id} part={part} />
          ))}
        </div>
      ) : null}
    </div>
  );
}