"use client";

import * as React from "react";
import { ChevronRight, CircleAlert, CornerDownRight, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api";
import { SubagentStepRow } from "@/components/chat/subagent-part";
import { describeTool, sentenceText } from "@/lib/tool-activity";
import type { MessageWithParts, Session, SubagentStep, ToolPart } from "@/lib/types";
import { cn } from "@/lib/utils";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toSteps(messages: MessageWithParts[]): SubagentStep[] {
  const steps: SubagentStep[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text") {
        if (message.info.role !== "assistant") continue;
        if (!part.text.trim()) continue;
        steps.push({
          id: part.id,
          kind: "text",
          text: part.text,
          status: "completed",
          at: message.info.time.created,
        });
      } else if (part.type === "tool") {
        const state = part.state;
        steps.push({
          id: part.id,
          kind: "tool",
          tool: part.tool,
          text: sentenceText(describeTool(part)),
          status:
            state.status === "error"
              ? "error"
              : state.status === "running" || state.status === "pending"
                ? "running"
                : "completed",
          at: message.info.time.created,
        });
      }
    }
  }
  return steps.slice(-60);
}

function cleanOutput(text: string): string {
  return text
    .replace(/<subagent[^>]*>/gi, "")
    .replace(/<\/subagent>/gi, "")
    .trim();
}

function matchChild(children: Session[], description: string): Session | null {
  if (children.length === 0) return null;
  if (description) {
    const exact = children.find((child) => child.title === description);
    if (exact) return exact;
    const partial = children.find(
      (child) =>
        child.title.includes(description) || description.includes(child.title),
    );
    if (partial) return partial;
  }
  return [...children].sort((a, b) => b.time.updated - a.time.updated)[0] ?? null;
}

export function OpenCodeSubagentView({ part }: { part: ToolPart }) {
  const input = asRecord(part.state.input);
  const agent = str(input.agent, "subagent");
  const description = str(input.description);
  const prompt = str(input.prompt);
  const parentSessionID = part.sessionID;
  const output =
    part.state.status === "completed" ? str(part.state.output) : "";
  const outputChildID =
    /<subagent\s+sessionID="([^"]+)"/i.exec(output)?.[1] ?? "";
  const explicitChildID = str(input.sessionID) || outputChildID;

  const [open, setOpen] = React.useState(true);
  const [matchedChildID, setMatchedChildID] = React.useState("");
  const [steps, setSteps] = React.useState<SubagentStep[]>([]);
  const childID = explicitChildID || matchedChildID;
  const running =
    part.state.status === "running" || part.state.status === "pending";
  const failed = part.state.status === "error";

  React.useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        let currentChildID = explicitChildID || matchedChildID;
        if (!currentChildID) {
          const children = await apiJson<Session[]>(
            `/sessions/${encodeURIComponent(parentSessionID)}/children`,
          );
          const match = matchChild(children, description);
          if (match && !cancelled) {
            setMatchedChildID(match.id);
            currentChildID = match.id;
          }
        }
        if (currentChildID) {
          const messages = await apiJson<MessageWithParts[]>(
            `/sessions/${encodeURIComponent(currentChildID)}/messages`,
          );
          if (!cancelled) setSteps(toSteps(messages));
        }
      } catch {
        // A transient upstream failure should not clear the steps.
      }
      if (!cancelled && (running || !childID)) {
        timer = window.setTimeout(tick, 2000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [childID, description, explicitChildID, matchedChildID, parentSessionID, running]);

  const duration =
    part.state.status === "completed" &&
    "time" in part.state &&
    part.state.time.end
      ? part.state.time.end - part.state.time.start
      : undefined;
  const result = cleanOutput(output);

  return (
    <div className="group/tool">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-sm px-1.5 py-1 text-left text-[13px] outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        title={description ?? undefined}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {running ? (
            <Loader2 className="size-[15px] animate-spin text-brand" />
          ) : failed ? (
            <CircleAlert className="size-[15px] text-destructive" />
          ) : (
            <CornerDownRight className="size-[15px] text-muted-foreground" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="shrink-0 text-foreground/85">Subagent: {agent}</span>
          {description ? (
            <span className="truncate text-[12px] text-muted-foreground">{description}</span>
          ) : null}
          <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
            {steps.length} step{steps.length === 1 ? "" : "s"}
            {duration ? ` · ${(duration / 1000).toFixed(1)}s` : ""}
          </span>
        </span>
        {failed ? <span className="status-square bg-destructive" aria-label="Failed" /> : null}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-[transform,opacity]",
            open
              ? "rotate-90 opacity-100"
              : "opacity-0 group-hover/tool:opacity-100 group-focus-within/tool:opacity-100",
          )}
        />
      </button>

      {open ? (
        <div className="ml-6 mt-1 space-y-2 border-l border-border pb-1 pl-3">
          {prompt ? (
            <details className="rounded-md bg-muted px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
                Prompt
              </summary>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground">
                {prompt}
              </p>
            </details>
          ) : null}

          {steps.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              {running ? "Waiting for the subagent session…" : "No progress recorded."}
            </p>
          ) : (
            <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto pr-0.5">
              {steps.map((step) => (
                <SubagentStepRow key={step.id} step={step} />
              ))}
            </div>
          )}

          {result ? (
            <details className="rounded-md bg-muted px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
                Result
              </summary>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                {result}
              </pre>
            </details>
          ) : null}

          {part.state.status === "error" && part.state.error ? (
            <div className="rounded-md border-l-2 border-destructive bg-destructive/8 px-2 py-1.5 text-[11px] text-destructive">
              {part.state.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
