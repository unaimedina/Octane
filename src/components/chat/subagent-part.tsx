"use client";

import * as React from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Loader2,
  Terminal,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubagentPart, SubagentStep } from "@/lib/types";
import { cn } from "@/lib/utils";

function StepStatus({ status }: { status?: SubagentStep["status"] }) {
  if (status === "completed") return <Check className="size-3 text-success" />;
  if (status === "error") return <CircleAlert className="size-3 text-destructive" />;
  return <Loader2 className="size-3 animate-spin text-info" />;
}

export function SubagentStepRow({ step }: { step: SubagentStep }) {
  if (step.kind === "status") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]",
          step.status === "error"
            ? "border-destructive/25 bg-destructive/5 text-destructive"
            : "border-success/20 bg-success/5 text-success dark:text-success",
        )}
      >
        <StepStatus status={step.status} />
        <span className="min-w-0 flex-1">{step.text}</span>
      </div>
    );
  }

  if (step.kind === "tool") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-border/60 bg-muted/40">
          {step.tool === "bash" ? (
            <Terminal className="size-3 text-muted-foreground" />
          ) : (
            <Wrench className="size-3 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wide">
              {step.tool ?? "tool"}
            </span>
            <StepStatus status={step.status} />
          </div>
          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground">
            {step.text || "Working…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-[11px] leading-relaxed">
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

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-card/40",
        part.state.status === "error"
          ? "border-destructive/30"
          : "border-info/25",
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
          ) : part.state.status === "error" ? (
            <CircleAlert className="size-3.5 text-destructive" />
          ) : (
            <Bot className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">Subagent</span>
            <span className="rounded bg-info/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-info dark:text-info">
              {part.agent}
            </span>
            <Badge
              variant={running ? "secondary" : "outline"}
              className="font-mono text-[9px]"
            >
              {part.state.status}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {steps.length} step{steps.length === 1 ? "" : "s"}
              {duration ? ` · ${(duration / 1000).toFixed(1)}s` : ""}
            </span>
          </span>
          {part.description ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {part.description}
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
          {part.prompt ? (
            <details className="mb-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground">
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
            <div className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
              {steps.map((step) => (
                <SubagentStepRow key={step.id} step={step} />
              ))}
            </div>
          )}

          {part.state.output ? (
            <details className="mt-2 rounded-md border border-success/20 bg-success/5 px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[10px] font-medium text-success dark:text-success">
                Result
              </summary>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                {part.state.output}
              </pre>
            </details>
          ) : null}

          {part.state.error ? (
            <div className="mt-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              {part.state.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
