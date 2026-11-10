"use client";

import * as React from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
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
import { Button } from "@/components/ui/button";
import type { ToolPart } from "@/lib/types";
import { cn } from "@/lib/utils";

const toolIcons: Record<string, LucideIcon> = {
  bash: Terminal,
  shell: Terminal,
  read: FileText,
  write: FilePen,
  edit: FilePen,
  patch: FilePen,
  grep: Search,
  glob: Search,
  list: Search,
  webfetch: Globe,
  todowrite: ListTodo,
  todo: ListTodo,
  task: Bot,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickSummary(part: ToolPart): string {
  const input = asRecord(part.state.input);
  const state = part.state;
  if (state.status === "running" && state.title) return state.title;
  if (state.status === "completed" && state.title) return state.title;
  for (const key of ["description", "command", "file_path", "filePath", "path", "pattern", "query", "url", "prompt"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.length > 160 ? `${value.slice(0, 157)}…` : value;
    }
  }
  return part.tool;
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
    pickSummary(part);
  const description =
    typeof input.description === "string"
      ? input.description
      : "title" in state && typeof state.title === "string"
        ? state.title
        : undefined;
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

function ToolCard({ part }: { part: ToolPart }) {
  const edits = editPreviews(part);
  const [open, setOpen] = React.useState(part.state.status === "error");
  const state = part.state;
  const metadata = asRecord("metadata" in state ? state.metadata : undefined);
  const Icon = toolIcons[part.tool] ?? Wrench;
  const summary = pickSummary(part);
  const running = state.status === "running" || state.status === "pending";
  const failed = state.status === "error";

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
            <Icon className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-wide">
              {part.tool}
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-px font-mono text-[9px] uppercase tracking-wider",
                running && "bg-info/10 text-info dark:text-info",
                failed && "bg-destructive/10 text-destructive",
                !running && !failed && "bg-success/10 text-success dark:text-success",
              )}
            >
              {state.status}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {summary}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border/60 bg-background/40 px-3 py-3">
          {edits.length > 0 ? (
            <div className="space-y-2">
              {edits.map((edit, index) => (
                <div
                  key={`${edit.file ?? "file"}-${index}`}
                  className="overflow-hidden rounded-lg border border-border/60"
                >
                  <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                    <FilePen className="size-3" />
                    <span className="truncate">{edit.file ?? summary}</span>
                  </div>
                  <DiffView
                    before={edit.before}
                    after={edit.after}
                    file={edit.file ?? summary}
                  />
                </div>
              ))}
            </div>
          ) : diff ? (
            <DiffView diff={diff} file={summary} />
          ) : null}

          {edits.length > 0 ? (
            <details className="rounded-md border border-border/60 bg-muted/20">
              <summary className="cursor-pointer list-none px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                Raw input
              </summary>
              <pre className="scrollbar-thin max-h-56 overflow-auto border-t border-border/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                {JSON.stringify(state.input, null, 2)}
              </pre>
            </details>
          ) : (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                Input
              </div>
              <pre className="scrollbar-thin max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                {JSON.stringify(state.input, null, 2)}
              </pre>
            </div>
          )}

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
      ) : null}
    </div>
  );
}
