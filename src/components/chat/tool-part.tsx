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

  const succeeded = state.status === "completed" && (exitCode === undefined || exitCode === 0);

  return (
    <div className="group/tool">
      <ToolRowButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
        title={description ? `${command} · ${description}` : command}
        icon={
          running ? (
            <Loader2 className="size-[15px] animate-spin text-brand" />
          ) : failed ? (
            <CircleAlert className="size-[15px] text-destructive" />
          ) : (
            <Terminal className="size-[15px] text-muted-foreground" />
          )
        }
        trailing={
          failed || (exitCode !== undefined && exitCode !== 0) ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-destructive">
              {exitCode !== undefined ? `exit ${exitCode}` : null}
              <span className="status-square bg-destructive" aria-label="Failed" />
            </span>
          ) : succeeded ? (
            <Check className="size-[13px] text-muted-foreground" aria-label="Completed" />
          ) : null
        }
      >
        <span className="shrink-0 text-foreground/85">{running ? "Running" : "Ran"}</span>
        <span className="truncate font-mono text-[12px]">{command}</span>
      </ToolRowButton>

      {open ? (
        <ToolRowBody>
          <div className="overflow-hidden rounded-md bg-muted">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <Terminal className="size-3 shrink-0" />
                <span className="truncate">{description || "Terminal"}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => void copy()}
                disabled={!output && !command}
                aria-label="Copy shell command and output"
                title="Copy command and output"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            </div>
            <pre className="scrollbar-thin max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-relaxed text-foreground">
              <span className="text-muted-foreground">$ </span>
              {command}
              {"\n\n"}
              <span className={failed ? "text-destructive" : "text-muted-foreground"}>
                {running && !output
                  ? "Running…"
                  : output
                    ? output.length > 20_000
                      ? `${output.slice(0, 20_000)}\n… truncated`
                      : output
                    : "No output."}
              </span>
            </pre>
          </div>
        </ToolRowBody>
      ) : null}
    </div>
  );
}

/** One-line tool row header: icon, sentence, trailing marker, hover chevron. */
function ToolRowButton({
  open,
  onToggle,
  title,
  icon,
  trailing,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-sm px-1.5 py-1 text-left text-[13px] outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
      aria-expanded={open}
      title={title}
    >
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">{children}</span>
      {trailing}
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-[transform,opacity]",
          open
            ? "rotate-90 opacity-100"
            : "opacity-0 group-hover/tool:opacity-100 group-focus-within/tool:opacity-100",
        )}
      />
    </button>
  );
}

function ToolRowBody({ children }: { children: React.ReactNode }) {
  return <div className="ml-6 mt-1 space-y-3 border-l border-border pb-1 pl-3">{children}</div>;
}

/** "+18 −2" from an edit sentence, or null for every other detail (never +0 −0). */
function diffCounts(kind: ToolKind, detail: string | undefined): { add: string; del: string } | null {
  if (kind !== "edit" || !detail) return null;
  const match = /^\+(\d+) −(\d+)$/.exec(detail);
  if (!match || (match[1] === "0" && match[2] === "0")) return null;
  return { add: match[1], del: match[2] };
}

function RawDetails({ label, text, tone }: { label: string; text: string; tone?: "error" }) {
  return (
    <details className="rounded-md bg-muted">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <pre
        className={cn(
          "scrollbar-thin max-h-56 overflow-auto border-t border-border p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
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
  const counts = diffCounts(sentence.kind, sentence.detail);

  return (
    <div className="group/tool">
      <ToolRowButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
        title={fullText}
        icon={
          running ? (
            <Loader2 className="size-[15px] animate-spin text-brand" />
          ) : failed ? (
            <CircleAlert className="size-[15px] text-destructive" />
          ) : (
            <Icon className="size-[15px] text-muted-foreground" />
          )
        }
        trailing={failed ? <span className="status-square bg-destructive" aria-label="Failed" /> : null}
      >
        <span className="shrink-0 text-foreground/85">{sentence.verb}</span>
        {sentence.target ? (
          <span className="truncate font-mono text-[12px]">{sentence.target}</span>
        ) : null}
        {counts ? (
          <span className="shrink-0 font-mono text-[12px]">
            <span className="text-success">+{counts.add}</span>{" "}
            <span className="text-destructive">−{counts.del}</span>
          </span>
        ) : sentence.detail ? (
          <span
            className={cn(
              "shrink-0 font-mono text-[12px] text-muted-foreground",
              failed && "max-w-[40%] truncate text-destructive",
            )}
          >
            · {sentence.detail}
          </span>
        ) : null}
      </ToolRowButton>

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
    <ToolRowBody>
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
                  className="overflow-hidden rounded-md bg-muted"
                >
                  <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
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
              <div className="mb-1 text-[11px] text-muted-foreground">
                {failed ? "Error" : "Output"}
              </div>
              <pre
                className={cn(
                  "scrollbar-thin max-h-80 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
                  failed && "text-destructive",
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
                className="max-h-56 rounded-md border border-border object-contain"
              />
            ) : null,
          )}
        </div>
      ) : null}
    </ToolRowBody>
  );
}

export function ExploreGroup({ parts }: { parts: ToolPart[] }) {
  const summary = React.useMemo(() => exploreSummary(parts), [parts]);
  const failed = parts.some((part) => part.state.status === "error");
  const [open, setOpen] = React.useState(failed);

  return (
    <div className="group/tool">
      <ToolRowButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
        title={summary.text}
        icon={
          summary.running ? (
            <Loader2 className="size-[15px] animate-spin text-brand" />
          ) : (
            <Search className="size-[15px] text-muted-foreground" />
          )
        }
        trailing={failed ? <span className="status-square bg-destructive" aria-label="Failed" /> : null}
      >
        <span className="truncate text-foreground/85">{summary.text}</span>
      </ToolRowButton>
      {open ? (
        <div className="ml-6 mt-1 space-y-0.5 border-l border-border pl-3">
          {parts.map((part) => (
            <ToolCallPart key={part.id} part={part} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
