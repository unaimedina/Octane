"use client";

import * as React from "react";
import { Bot, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api";
import { SubagentStepRow } from "@/components/chat/subagent-part";
import { Badge } from "@/components/ui/badge";
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
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-card/40",
        failed ? "border-destructive/30" : "border-info/25",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
        aria-expanded={open}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-info/25 bg-info/10 text-info dark:text-info">
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : failed ? (
            <CircleAlert className="size-3.5 text-destructive" />
          ) : (
            <Bot className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">Subagent</span>
            <span className="rounded bg-info/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-info dark:text-info">
              {agent}
            </span>
            <Badge
              variant={running ? "secondary" : "outline"}
              className="font-mono text-[9px]"
            >
              {part.state.status === "pending" ? "running" : part.state.status}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {steps.length} step{steps.length === 1 ? "" : "s"}
              {duration ? ` · ${(duration / 1000).toFixed(1)}s` : ""}
            </span>
          </span>
          {description ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-border/50 bg-muted/10 px-2.5 py-2">
          {prompt ? (
            <details className="mb-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground">
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
            <div className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
              {steps.map((step) => (
                <SubagentStepRow key={step.id} step={step} />
              ))}
            </div>
          )}

          {result ? (
            <details className="mt-2 rounded-md border border-success/20 bg-success/5 px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[10px] font-medium text-success dark:text-success">
                Result
              </summary>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                {result}
              </pre>
            </details>
          ) : null}

          {part.state.status === "error" && part.state.error ? (
            <div className="mt-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              {part.state.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
