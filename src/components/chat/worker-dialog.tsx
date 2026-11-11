"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api";
import { toSteps } from "@/components/chat/opencode-subagent";
import { SubagentStepRow } from "@/components/chat/subagent-part";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  MessageWithParts,
  SessionStatus,
  SubagentStep,
  Task,
  WorkerRecord,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;

function isBusy(status: SessionStatus | undefined): boolean {
  return status?.type === "busy" || status?.type === "retry";
}

/**
 * Live transcript of one worker session. Mounted only while the dialog is open
 * and keyed by session id, so state resets per worker and polling stops on close.
 */
function WorkerTranscript({ sessionID, busy }: { sessionID: string; busy: boolean }) {
  const [steps, setSteps] = React.useState<SubagentStep[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const atBottomRef = React.useRef(true);

  // Fetch now, then every 2 s while the session is busy. When it turns idle the
  // effect re-runs once more and stops.
  React.useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const messages = await apiJson<MessageWithParts[]>(
          `/sessions/${encodeURIComponent(sessionID)}/messages`,
        );
        if (!cancelled) {
          setSteps(toSteps(messages));
          setLoaded(true);
          setFailed(false);
        }
      } catch {
        // Keep the last good steps on a transient failure.
        if (!cancelled) setFailed(true);
      }
      if (!cancelled && busy) timer = window.setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionID, busy]);

  // Follow new steps only when the user was already at the bottom.
  React.useEffect(() => {
    if (!atBottomRef.current) return;
    const viewport = bodyRef.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']",
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [steps]);

  const onScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.target as HTMLElement;
    if (el?.dataset?.slot !== "scroll-area-viewport") return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  return (
    <div ref={bodyRef} onScrollCapture={onScroll} className="min-h-0 flex-1">
      <ScrollArea className="h-full">
        {steps.length > 0 ? (
          <div className="space-y-1.5 pr-3">
            {steps.map((step) => (
              <SubagentStepRow key={step.id} step={step} />
            ))}
          </div>
        ) : failed ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Could not load this worker&apos;s transcript.
          </p>
        ) : loaded ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No steps yet.</p>
        ) : (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading transcript…
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function WorkerDialog({
  worker,
  task,
  status,
  onOpenChange,
  onStop,
}: {
  worker: WorkerRecord | null;
  task: Task | undefined;
  status: SessionStatus | undefined;
  onOpenChange: (open: boolean) => void;
  onStop?: (task: Task) => void;
}) {
  const busy = isBusy(status);
  const run = task?.run;
  const ownsRun = !!worker && run?.sessionID === worker.sessionID;
  const canStop = !!task && !!onStop && task.status === "in_progress" && ownsRun;

  return (
    <Dialog open={worker !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{worker?.title ?? "Worker"}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  busy ? "bg-info pulse-dot" : "bg-muted-foreground/40",
                )}
              />
              {busy ? "Running" : "Idle"}
            </span>
            {ownsRun && run?.outcome ? (
              <Badge variant="outline" className="max-w-full truncate">
                {run.summary ? `${run.outcome}: ${run.summary}` : run.outcome}
              </Badge>
            ) : null}
            <DialogDescription className="text-xs">
              Worker session for this chat&apos;s task list.
            </DialogDescription>
          </div>
        </DialogHeader>

        {worker ? (
          <WorkerTranscript key={worker.sessionID} sessionID={worker.sessionID} busy={busy} />
        ) : null}

        <DialogFooter>
          {canStop && task ? (
            <Button variant="outline" onClick={() => onStop?.(task)}>
              Stop
            </Button>
          ) : null}
          {worker ? (
            <Button variant="ghost" asChild>
              <Link href={`/chat/${encodeURIComponent(worker.sessionID)}`}>
                Open full session
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
