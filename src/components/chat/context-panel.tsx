"use client";

import * as React from "react";
import {
  Check,
  Circle,
  CircleDot,
  CircleX,
  Copy,
  GitCompareArrows,
  GitMerge,
  ListTodo,
  Loader2,
  Play,
  X,
} from "lucide-react";
import { createTwoFilesPatch } from "diff";
import { toast } from "sonner";
import { DiffView } from "@/components/chat/diff-view";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileDiff, Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

function TodoRow({
  todo,
  onRun,
  busy,
}: {
  todo: Todo;
  onRun?: (todo: Todo) => void;
  busy?: boolean;
}) {
  const icon =
    todo.status === "completed" ? (
      <Check className="size-3.5 text-success" />
    ) : todo.status === "in_progress" ? (
      <Loader2 className="size-3.5 animate-spin text-info" />
    ) : todo.status === "cancelled" ? (
      <CircleX className="size-3.5 text-muted-foreground/60" />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/50" />
    );

  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[13px] leading-snug",
            todo.status === "completed" && "text-muted-foreground line-through",
            todo.status === "cancelled" && "text-muted-foreground line-through",
          )}
        >
          {todo.content}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
          <span>{todo.status.replace("_", " ")}</span>
          <span>·</span>
          <span>{todo.priority}</span>
        </div>
      </div>
      {onRun && todo.status !== "completed" && todo.status !== "cancelled" ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-success"
          onClick={() => onRun(todo)}
          disabled={busy}
          aria-label={`Execute task: ${todo.content}`}
          title={busy ? "Wait for the current turn" : "Execute this task"}
        >
          <Play className="size-3" />
        </Button>
      ) : null}
    </li>
  );
}

function FileDiffDetails({ file }: { file: FileDiff }) {
  const [open, setOpen] = React.useState(false);
  const patch = (file as FileDiff & { patch?: string }).patch;
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group overflow-hidden rounded-[10px] border border-border/60 bg-card/30"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs [&::-webkit-details-marker]:hidden">
        <X className="size-3 -rotate-45 text-muted-foreground/40 group-open:hidden" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {file.file.replace(/\\/g, "/")}
        </span>
        <span className="font-mono text-[10px] text-success dark:text-success">
          +{file.additions}
        </span>
        <span className="font-mono text-[10px] text-destructive dark:text-destructive">
          -{file.deletions}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const text =
              patch ??
              (typeof file.before === "string" && typeof file.after === "string"
                ? createTwoFilesPatch(file.file, file.file, file.before, file.after)
                : "");
            if (!text) return;
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success("Patch copied"))
              .catch(() => toast.error("Could not copy the patch"));
          }}
          className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={`Copy patch for ${file.file}`}
          title="Copy patch"
        >
          <Copy className="size-3" />
        </button>
      </summary>
      {open ? (
        <div className="border-t border-border/60">
          {patch ? (
            <DiffView
              diff={patch}
              file={file.file}
              additions={file.additions}
              deletions={file.deletions}
              hideHeader
              className="rounded-none border-0"
            />
          ) : (
            <DiffView
              before={file.before}
              after={file.after}
              file={file.file}
              hideHeader
              className="rounded-none border-0"
            />
          )}
        </div>
      ) : null}
    </details>
  );
}

export const ContextPanel = React.memo(function ContextPanel({
  todos,
  diff,
  className,
  onRunTask,
  onResolveConflicts,
  busy,
}: {
  todos: Todo[];
  diff: FileDiff[];
  className?: string;
  onRunTask?: (todo: Todo) => void;
  onResolveConflicts?: () => void;
  busy?: boolean;
}) {
  const additions = diff.reduce((sum, file) => sum + file.additions, 0);
  const deletions = diff.reduce((sum, file) => sum + file.deletions, 0);
  const completed = todos.filter((todo) => todo.status === "completed").length;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-muted/15", className)}>
      <Tabs defaultValue={todos.length > 0 ? "tasks" : "changes"} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center gap-1.5 border-b border-border/70 px-3 py-2.5">
          <TabsList className="min-w-0 flex-1">
            <TabsTrigger value="tasks" className="flex-1 gap-1.5 text-xs">
              <ListTodo className="size-3.5" />
              Tasks
              <span className="font-mono text-[10px] text-muted-foreground">
                {todos.length ? `${completed}/${todos.length}` : "0"}
              </span>
            </TabsTrigger>
            <TabsTrigger value="changes" className="flex-1 gap-1.5 text-xs">
              <GitCompareArrows className="size-3.5" />
              Changes
              <span className="font-mono text-[10px] text-muted-foreground">
                {diff.length || "0"}
              </span>
            </TabsTrigger>
          </TabsList>
          {onResolveConflicts ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onResolveConflicts}
              disabled={busy}
              aria-label="Resolve git conflicts"
              title="Ask the agent to resolve git conflicts"
            >
              <GitMerge className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <TabsContent value="tasks" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {todos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <CircleDot className="size-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No tasks yet. The agent will publish a plan here when it starts
                  working.
                </p>
              </div>
            ) : (
              <ul className="space-y-0.5 p-2">
                {todos.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} onRun={onRunTask} busy={busy} />
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="changes" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {diff.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <GitCompareArrows className="size-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No file changes in this session yet.
                </p>
              </div>
            ) : (
              <div className="p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
                  <span className="font-mono uppercase tracking-[0.14em]">
                    {diff.length} file{diff.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-mono">
                    <span className="text-success dark:text-success">+{additions}</span>{" "}
                    <span className="text-destructive dark:text-destructive">-{deletions}</span>
                  </span>
                </div>
                <div className="space-y-2">
                  {diff.map((file) => (
                    <FileDiffDetails key={file.file} file={file} />
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
});
