"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FastForward,
  FolderInput,
  GitMerge,
  ListPlus,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  OctagonAlert,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { createTwoFilesPatch } from "diff";
import { toast } from "sonner";
import { DiffView } from "@/components/chat/diff-view";
import { TaskDialog } from "@/components/chat/task-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatElapsed } from "@/lib/format";
import { isReady, readyTasks, waitingOn } from "@/lib/task-graph";
import type { TaskRunnerSettings } from "@/lib/tasks";
import type { FileDiff, Task, TaskInput, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Status squares follow the plan 014 design contract. */
const STATUS_SQUARE: Record<TaskStatus, string> = {
  completed: "bg-success",
  in_progress: "bg-brand",
  blocked: "bg-destructive",
  cancelled: "bg-muted-foreground/30",
  pending: "bg-muted-foreground/50",
};

const OUTCOME_SQUARE: Record<string, string> = {
  done: "bg-success",
  unverified: "bg-warning",
  blocked: "bg-destructive",
  error: "bg-destructive",
  aborted: "bg-muted-foreground/50",
};

/** Run duration: live while running, fixed once finished, "—" without a run. */
function taskDuration(task: Task, now: number): string {
  const run = task.run;
  if (!run?.startedAt) return "—";
  if (run.endedAt) return formatElapsed(run.endedAt - run.startedAt);
  if (task.status === "in_progress") return formatElapsed(now - run.startedAt);
  return "—";
}

function TaskRow({
  task,
  index,
  indexById,
  byId,
  now,
  busy,
  onRun,
  onRunWorker,
  onStop,
  onOpenWorker,
  onEdit,
  onDelete,
  onStatus,
}: {
  task: Task;
  index: number;
  indexById: Map<string, number>;
  byId: Map<string, Task>;
  /** Shared clock from ContextPanel; rows never run their own timers. */
  now: number;
  busy?: boolean;
  onRun?: (task: Task) => void;
  onRunWorker?: (task: Task) => void;
  onStop?: (task: Task) => void;
  onOpenWorker?: (sessionID: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
}) {
  const toggleTo: TaskStatus =
    task.status === "completed" ||
    task.status === "cancelled" ||
    task.status === "blocked"
      ? "pending"
      : "completed";

  const dependsOn = task.dependsOn ?? [];
  const waiting =
    task.status === "pending" && !isReady(task, byId)
      ? waitingOn(task, byId)
      : [];
  const afterLabel = dependsOn
    .map((id) => indexById.get(id))
    .filter((value): value is number => value !== undefined)
    .map((value) => `#${value}`)
    .join(", ");
  const showOutcome = task.run?.outcome && task.status !== "in_progress";
  const workerID =
    task.run?.mode === "worker" && task.run.sessionID ? task.run.sessionID : "";

  const toggleStatus = () => {
    if (task.status === "in_progress") return;
    onStatus(task, toggleTo);
  };

  const showPrompt =
    task.prompt.trim() &&
    task.prompt.trim() !== task.title.trim() &&
    task.prompt.trim() !== task.description.trim();

  return (
    <li className="group/task flex min-w-0 items-start gap-2.5 rounded-sm px-2 py-2 transition-colors hover:bg-accent/60">
      <span className="w-5 shrink-0 pt-px text-right font-mono text-[11px] text-muted-foreground">
        {index}
      </span>
      <button
        type="button"
        onClick={toggleStatus}
        disabled={task.status === "in_progress"}
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        aria-label={`Mark ${task.title} ${toggleTo}`}
        title={
          task.status === "in_progress" ? "Running" : `Mark ${toggleTo}`
        }
      >
        <span className={cn("status-square", STATUS_SQUARE[task.status])} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <div
            className={cn(
              "line-clamp-2 min-w-0 flex-1 break-words text-[13px] leading-snug",
              (task.status === "completed" || task.status === "cancelled") &&
                "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </div>
          <span
            className="shrink-0 pt-px font-mono text-[11px] tabular-nums text-muted-foreground"
            suppressHydrationWarning
          >
            {taskDuration(task, now)}
          </span>
        </div>
        {task.description ? (
          <p className="mt-1 line-clamp-2 break-words whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        {showPrompt ? (
          <p className="mt-1 flex min-w-0 items-start gap-1 text-[11px] leading-relaxed text-muted-foreground">
            <MessageSquare className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 truncate">{task.prompt}</span>
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <span>{task.status.replace("_", " ")}</span>
          <span>·</span>
          <span>{task.priority}</span>
        </div>
        {afterLabel ? (
          <p className="min-w-0 truncate text-[11px] leading-relaxed text-muted-foreground">
            after {afterLabel}
          </p>
        ) : null}
        {waiting.length > 0 ? (
          <p
            className="min-w-0 truncate text-[11px] leading-relaxed text-muted-foreground"
            title={`Waiting on: ${waiting.join(", ")}`}
          >
            Waiting on: {waiting.join(", ")}
          </p>
        ) : null}
        {showOutcome && task.run?.outcome ? (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-relaxed">
            <span
              className={cn("status-square", OUTCOME_SQUARE[task.run.outcome])}
              aria-hidden="true"
            />
            <span
              className="shrink-0 font-mono text-muted-foreground"
              title={
                task.run.outcome === "unverified"
                  ? "Finished without a result line"
                  : undefined
              }
            >
              {task.run.outcome}
            </span>
            {task.run.summary ? (
              <span
                className="min-w-0 truncate text-muted-foreground"
                title={task.run.summary}
              >
                {task.run.summary}
              </span>
            ) : null}
          </div>
        ) : null}
        {workerID && onOpenWorker ? (
          <button
            type="button"
            onClick={() => onOpenWorker(workerID)}
            className="mt-0.5 flex min-w-0 items-center gap-1 truncate rounded-sm text-[11px] text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            title={`Worker session ${workerID}`}
          >
            <span className="min-w-0 truncate">Open worker</span>
            <ExternalLink className="size-3 shrink-0" />
          </button>
        ) : workerID ? (
          <Link
            href={`/chat/${encodeURIComponent(workerID)}`}
            className="mt-0.5 flex min-w-0 items-center gap-1 truncate rounded-sm text-[11px] text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            title={`Worker session ${workerID}`}
          >
            <span className="min-w-0 truncate">Open worker</span>
            <ExternalLink className="size-3 shrink-0" />
          </Link>
        ) : null}
      </div>

      <div className="mt-0.5 flex shrink-0 items-center">
        {task.status === "in_progress" && onStop ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onStop(task)}
            aria-label={`Stop task: ${task.title}`}
            title="Stop this task"
          >
            <Square className="size-3" />
          </Button>
        ) : onRun ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onRun(task)}
            disabled={busy || task.status === "in_progress" || waiting.length > 0}
            aria-label={`Run task: ${task.title}`}
            title={
              task.status === "in_progress"
                ? "Task is running"
                : waiting.length > 0
                  ? `Waiting on ${waiting.join(", ")}`
                  : busy
                    ? "Wait for the current turn"
                    : "Run in this chat"
            }
          >
            <Play className="size-3" />
          </Button>
        ) : null}
        {task.status !== "in_progress" && onRunWorker ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="-ml-1 w-3.5 text-muted-foreground"
                disabled={waiting.length > 0}
                aria-label={`More ways to run: ${task.title}`}
                title="More ways to run"
              >
                <ChevronDown className="size-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => onRun?.(task)}
                disabled={busy || !onRun}
              >
                <Play className="size-3.5" /> Run in this chat
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRunWorker(task)}>
                <FastForward className="size-3.5" /> Run in a worker
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => onEdit(task)}
          disabled={task.status === "in_progress"}
          aria-label={`Edit task: ${task.title}`}
          title={
            task.status === "in_progress" ? "Stop the task to edit it" : "Edit task"
          }
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(task)}
          aria-label={`Delete task: ${task.title}`}
          title="Delete task"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </li>
  );
}

function TaskRunnerToolbar({
  runner,
  running,
  ready,
  onToggleAutoRun,
  onRunReady,
  onMaxParallelChange,
  onDismissStalled,
}: {
  runner: TaskRunnerSettings;
  running: number;
  ready: number;
  onToggleAutoRun?: (autoRun: boolean) => Promise<void>;
  onRunReady?: () => Promise<void>;
  onMaxParallelChange?: (maxParallel: number) => Promise<void>;
  onDismissStalled?: () => void;
}) {
  const [pending, setPending] = React.useState<"auto" | "ready" | null>(null);

  async function act(kind: "auto" | "ready", fn: () => Promise<void>) {
    if (pending) return;
    setPending(kind);
    try {
      await fn();
    } catch (error) {
      toast.error(
        kind === "auto" ? "Could not change auto-run" : "Could not start tasks",
        { description: error instanceof Error ? error.message : undefined },
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          aria-pressed={runner.autoRun}
          disabled={pending !== null || !onToggleAutoRun}
          onClick={() => {
            if (onToggleAutoRun) void act("auto", () => onToggleAutoRun(!runner.autoRun));
          }}
          title={
            runner.autoRun
              ? "Stop starting new tasks (running ones continue)"
              : "Keep starting ready tasks until the list is done"
          }
          className="shrink-0 text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
        >
          {pending === "auto" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FastForward className={cn(runner.autoRun && "text-brand")} />
          )}
          {runner.autoRun ? "Stop auto-run" : "Auto-run"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={pending !== null || ready === 0 || !onRunReady}
          onClick={() => {
            if (onRunReady) void act("ready", onRunReady);
          }}
          title="Start ready tasks in worker sessions now"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {pending === "ready" ? <Loader2 className="animate-spin" /> : <Play />}
          Run ready ({ready})
        </Button>
        <Select
          value={String(runner.maxParallel)}
          onValueChange={(value) => {
            if (!onMaxParallelChange) return;
            void onMaxParallelChange(Number(value)).catch((error: unknown) => {
              toast.error("Could not change the parallel limit", {
                description: error instanceof Error ? error.message : undefined,
              });
            });
          }}
          disabled={!onMaxParallelChange}
        >
          <SelectTrigger
            size="sm"
            className="ml-auto h-6 min-w-0 shrink-0 gap-1 border-transparent bg-transparent px-1.5 font-mono text-[11px] text-muted-foreground shadow-none hover:bg-accent hover:text-foreground data-[size=sm]:h-6 dark:bg-transparent dark:hover:bg-accent"
            aria-label="Parallel workers"
            title="How many worker sessions may run at once"
          >
            <SelectValue>{`workers ${runner.maxParallel}`}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {[1, 2, 3, 4].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {running > 0 || runner.autoRun ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          running {running}/{runner.maxParallel}
          {runner.autoRun ? " · auto-run on" : ""}
        </p>
      ) : null}
      {runner.stalled ? (
        <div className="flex min-w-0 items-start gap-1.5 rounded-sm bg-warning/10 px-2 py-1 text-[11px] text-warning">
          <OctagonAlert className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{runner.stalled}</span>
          {onDismissStalled ? (
            <button
              type="button"
              onClick={onDismissStalled}
              className="shrink-0 rounded-sm opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Dismiss"
              title="Dismiss"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Parallel workers share this folder. Make tasks that touch the same
        files depend on each other.
      </p>
    </div>
  );
}

function FileDiffDetails({ file }: { file: FileDiff }) {
  const [open, setOpen] = React.useState(false);
  const patch = (file as FileDiff & { patch?: string }).patch;
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group border-b border-border last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[12px]"
          title={file.file.replace(/\\/g, "/")}
        >
          {file.file.replace(/\\/g, "/")}
        </span>
        <span className="font-mono text-[11px] text-success">
          +{file.additions}
        </span>
        <span className="font-mono text-[11px] text-destructive">
          −{file.deletions}
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
          className="rounded-sm p-0.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Copy patch for ${file.file}`}
          title="Copy patch"
        >
          <Copy className="size-3" />
        </button>
      </summary>
      {open ? (
        <div className="border-t border-border">
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
  tasks,
  diff,
  className,
  hasRepo,
  planSteps = 0,
  planFiles,
  onRunTask,
  onRunTaskInWorker,
  onStopTask,
  onOpenWorker,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onImportPlan,
  onImportPlanFiles,
  onRefreshTasks,
  refreshing,
  onResolveConflicts,
  busy,
  runner,
  onToggleAutoRun,
  onRunReady,
  onMaxParallelChange,
  onDismissStalled,
}: {
  tasks: Task[];
  diff: FileDiff[];
  className?: string;
  hasRepo: boolean;
  planSteps?: number;
  planFiles?: { count: number; dir: string };
  onRunTask?: (task: Task) => void;
  onStopTask?: (task: Task) => void;
  onOpenWorker?: (sessionID: string) => void;
  onCreateTask?: (input: TaskInput) => Promise<unknown>;
  onUpdateTask?: (id: string, input: Partial<TaskInput>) => Promise<unknown>;
  onDeleteTask?: (id: string) => Promise<void>;
  onImportPlan?: () => Promise<void>;
  onImportPlanFiles?: () => void;
  /** Reload tasks and rescan the plans folder. */
  onRefreshTasks?: () => void;
  refreshing?: boolean;
  onResolveConflicts?: () => void;
  busy?: boolean;
  onRunTaskInWorker?: (task: Task) => void;
  runner?: TaskRunnerSettings;
  onToggleAutoRun?: (autoRun: boolean) => Promise<void>;
  onRunReady?: () => Promise<void>;
  onMaxParallelChange?: (maxParallel: number) => Promise<void>;
  onDismissStalled?: () => void;
}) {
  const additions = diff.reduce((sum, file) => sum + file.additions, 0);
  const deletions = diff.reduce((sum, file) => sum + file.deletions, 0);
  const completed = tasks.filter((task) => task.status === "completed").length;
  const ready = React.useMemo(() => readyTasks(tasks).length, [tasks]);
  const running = tasks.filter((task) => task.status === "in_progress").length;
  const byId = React.useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const indexById = React.useMemo(
    () => new Map(tasks.map((task, position) => [task.id, position + 1])),
    [tasks],
  );
  const [selectedTab, setSelectedTab] = React.useState<
    "tasks" | "changes" | null
  >(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | undefined>(
    undefined,
  );
  const [deleteTarget, setDeleteTarget] = React.useState<Task | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  // One shared 1 s clock, only while a task is running, for live durations.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (running === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const tab: "tasks" | "changes" =
    !hasRepo && selectedTab === "changes"
      ? "tasks"
      : (selectedTab ??
        (tasks.length > 0 || planSteps > 0 || (planFiles?.count ?? 0) > 0 || !hasRepo ? "tasks" : "changes"));

  function openCreate() {
    setEditingTask(undefined);
    setEditorOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditorOpen(true);
  }

  async function handleSave(input: TaskInput) {
    if (editingTask) {
      if (!onUpdateTask) return;
      await onUpdateTask(editingTask.id, input);
    } else {
      if (!onCreateTask) return;
      await onCreateTask(input);
    }
  }

  function handleStatus(task: Task, status: TaskStatus) {
    if (!onUpdateTask) return;
    void onUpdateTask(task.id, { status }).catch((error: unknown) => {
      toast.error("Could not update the task", {
        description: error instanceof Error ? error.message : undefined,
      });
    });
  }

  async function confirmDelete() {
    if (!deleteTarget || !onDeleteTask || deleting) return;
    setDeleting(true);
    try {
      await onDeleteTask(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      toast.error("Could not delete the task", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  async function importPlan() {
    if (!onImportPlan || importing) return;
    setImporting(true);
    try {
      await onImportPlan();
    } catch (error) {
      toast.error("Could not import the plan", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSelectedTab(value as "tasks" | "changes")
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex h-11 min-w-0 items-center gap-1 border-b border-border px-3">
          <TabsList className="h-9 min-w-0 gap-4 bg-transparent p-0">
            <TabsTrigger
              value="tasks"
              className="min-w-0 flex-none gap-1 overflow-hidden px-0 text-[13px] font-medium text-muted-foreground data-active:text-foreground"
            >
              Tasks
              <span className="font-mono text-[11px] text-muted-foreground">
                {tasks.length ? `${completed}/${tasks.length}` : "0"}
              </span>
              {ready > 0 ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  ready {ready}
                </span>
              ) : null}
            </TabsTrigger>
            {hasRepo ? (
              <TabsTrigger
                value="changes"
                className="min-w-0 flex-none gap-1 overflow-hidden px-0 text-[13px] font-medium text-muted-foreground data-active:text-foreground"
              >
                Changes
                <span className="font-mono text-[11px] text-muted-foreground">
                  {diff.length || "0"}
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0 text-muted-foreground"
            onClick={openCreate}
            aria-label="New task"
            title="New task"
          >
            <Plus className="size-3.5" />
          </Button>
          {onImportPlanFiles || onRefreshTasks || (hasRepo && onResolveConflicts) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground"
                  aria-label="More task actions"
                  title="More task actions"
                >
                  {refreshing ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <MoreHorizontal className="size-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {onImportPlanFiles ? (
                  <DropdownMenuItem onSelect={onImportPlanFiles}>
                    <FolderInput className="size-3.5" />
                    Import plans folder
                  </DropdownMenuItem>
                ) : null}
                {onRefreshTasks ? (
                  <DropdownMenuItem onSelect={onRefreshTasks} disabled={refreshing}>
                    <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
                    Refresh tasks
                  </DropdownMenuItem>
                ) : null}
                {hasRepo && onResolveConflicts ? (
                  <DropdownMenuItem onSelect={onResolveConflicts} disabled={busy}>
                    <GitMerge className="size-3.5" />
                    Resolve git conflicts
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <TabsContent
          value="tasks"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {runner && tasks.length > 0 ? (
            <TaskRunnerToolbar
              runner={runner}
              running={running}
              ready={ready}
              onToggleAutoRun={onToggleAutoRun}
              onRunReady={onRunReady}
              onMaxParallelChange={onMaxParallelChange}
              onDismissStalled={onDismissStalled}
            />
          ) : null}
          <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <p className="text-[13px] text-muted-foreground">
                  No tasks yet. Add a task, or import plan files from the
                  session&apos;s plans folder.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={openCreate} className="gap-1.5">
                    <Plus className="size-3.5" /> New task
                  </Button>
                  {planSteps > 0 && onImportPlan ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void importPlan()}
                      disabled={importing}
                      className="gap-1.5"
                    >
                      {importing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ListPlus className="size-3.5" />
                      )}
                      Import {planSteps} plan steps
                    </Button>
                  ) : null}
                  {onImportPlanFiles ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onImportPlanFiles}
                      className="gap-1.5"
                    >
                      <FolderInput className="size-3.5" />
                      {planFiles && planFiles.count > 0
                        ? `Import ${planFiles.count} plan files from ${planFiles.dir}/`
                        : "Import plans folder"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {planFiles && planFiles.count > 0 && onImportPlanFiles ? (
                  <div className="border-b border-border p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onImportPlanFiles}
                      disabled={busy}
                      className="w-full justify-start gap-1.5"
                    >
                      <ListPlus className="size-3.5" />
                      Import {planFiles.count} plan files from {planFiles.dir}/
                    </Button>
                  </div>
                ) : null}
                {planSteps > 0 && onImportPlan ? (
                  <div className="border-b border-border p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void importPlan()}
                      disabled={importing || busy}
                      className="w-full justify-start gap-1.5"
                    >
                      {importing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ListPlus className="size-3.5" />
                      )}
                      Import {planSteps} plan steps
                    </Button>
                  </div>
                ) : null}
                <ul className="flex w-full flex-col gap-0.5 p-2">
                  {tasks.map((task, position) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      index={position + 1}
                      indexById={indexById}
                      byId={byId}
                      now={now}
                      busy={busy}
                      onRun={onRunTask}
                      onRunWorker={onRunTaskInWorker}
                      onStop={onStopTask}
                      onOpenWorker={onOpenWorker}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                      onStatus={handleStatus}
                    />
                  ))}
                </ul>
              </>
            )}
          </ScrollArea>
        </TabsContent>

        {hasRepo ? (
          <TabsContent value="changes" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:!block">
              {diff.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    No file changes in this session yet.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px]">
                    <span className="font-mono text-muted-foreground">
                      {diff.length} file{diff.length === 1 ? "" : "s"}
                    </span>
                    <span className="font-mono">
                      <span className="text-success">+{additions}</span>{" "}
                      <span className="text-destructive">−{deletions}</span>
                    </span>
                  </div>
                  <div>
                    {diff.map((file) => (
                      <FileDiffDetails key={file.file} file={file} />
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        ) : null}
      </Tabs>

      {editorOpen ? (
        <TaskDialog
          key={editingTask?.id ?? "new"}
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setEditingTask(undefined);
          }}
          task={editingTask}
          tasks={tasks}
          onSave={handleSave}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be removed from this session. The
              conversation is not affected.
              {deleteTarget?.source?.kind === "plan-file" ? (
                <>
                  {" "}Its plan file {deleteTarget.source.ref} will be moved to
                  the plans folder&apos;s done/ folder.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
