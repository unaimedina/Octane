"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  CornerDownRight,
  Loader2,
  Terminal,
  Wrench,
} from "lucide-react";
import type { SubagentPart, SubagentStep } from "@/lib/types";
import { cn } from "@/lib/utils";

function StepStatus({ status }: { status?: SubagentStep["status"] }) {
  if (status === "completed") return <Check className="size-3 text-success" />;
  if (status === "error") return <CircleAlert className="size-3 text-destructive" />;
  return <Loader2 className="size-3 animate-spin text-brand" />;
}

export function SubagentStepRow({ step }: { step: SubagentStep }) {
  if (step.kind === "status") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-1 py-1 text-[12px]",
          step.status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <StepStatus status={step.status} />
        <span className="min-w-0 flex-1">{step.text}</span>
      </div>
    );
  }

  if (step.kind === "tool") {
    return (
      <div className="flex items-start gap-2 px-1 py-1">
        <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
          {step.tool === "bash" ? (
            <Terminal className="size-3 text-muted-foreground" />
          ) : (
            <Wrench className="size-3 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-foreground/85">
              {step.tool ?? "tool"}
            </span>
            <StepStatus status={step.status} />
          </div>
          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {step.text || "Working…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-1 py-1 text-[12px] leading-relaxed">
      <p className="line-clamp-4 whitespace-pre-wrap break-words">{step.text}</p>
    </div>
  );
}

export function SubagentPartView({ part }: { part: SubagentPart }) {
  const [open, setOpen] = React.useState(true);
  const running = part.state.status === "running";
  const steps = part.steps ?? [];
  const duration = part.state.time.end
    ? part.state.time.end - part.state.time.start
    : undefined;
  const failed = part.state.status === "error";

  return (
    <div className="group/tool">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-sm px-1.5 py-1 text-left text-[13px] outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        title={part.description ?? undefined}
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
          <span className="shrink-0 text-foreground/85">Subagent: {part.agent}</span>
          {part.description ? (
            <span className="truncate text-[12px] text-muted-foreground">{part.description}</span>
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
          {part.prompt ? (
            <details className="rounded-md bg-muted px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
                Prompt
              </summary>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground">
                {part.prompt}
              </p>
            </details>
          ) : null}

          {steps.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              Waiting for the subagent…
            </p>
          ) : (
            <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto pr-0.5">
              {steps.map((step) => (
                <SubagentStepRow key={step.id} step={step} />
              ))}
            </div>
          )}

          {part.state.output ? (
            <details className="rounded-md bg-muted px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
                Result
              </summary>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                {part.state.output}
              </pre>
            </details>
          ) : null}

          {part.state.error ? (
            <div className="rounded-md border-l-2 border-destructive bg-destructive/8 px-2 py-1.5 text-[11px] text-destructive">
              {part.state.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
