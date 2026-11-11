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
  ListPlus,
  ListTodo,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  Plus,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileDiff, Task, TaskInput, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

function TaskRow({
  task,
  busy,
  onRun,
  onEdit,
  onDelete,
  onStatus,
}: {
  task: Task;
  busy?: boolean;
  onRun?: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
}) {
  const icon =
    task.status === "completed" ? (
      <Check className="size-3.5 text-success" />
    ) : task.status === "in_progress" ? (
      <Loader2 className="size-3.5 animate-spin text-info" />
    ) : task.status === "cancelled" ? (
      <CircleX className="size-3.5 text-muted-foreground/60" />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/50" />
    );

  const toggleTo: TaskStatus =
    task.status === "completed" || task.status === "cancelled"
      ? "pending"
      : "completed";

  const toggleStatus = () => {
    if (task.status === "in_progress") return;
    onStatus(task, toggleTo);
  };

  const showPrompt =
    task.prompt.trim() &&
    task.prompt.trim() !== task.title.trim() &&
    task.prompt.trim() !== task.description.trim();

  return (
    <li className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
      <button
        type="button"
        onClick={toggleStatus}
        disabled={task.status === "in_progress"}
        className="mt-0.5 shrink-0 rounded-full outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        aria-label={`Mark ${task.title} ${toggleTo}`}
        title={
          task.status === "in_progress" ? "Running" : `Mark ${toggleTo}`
        }
      >
        {icon}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "line-clamp-2 break-words text-[13px] leading-snug",
            (task.status === "completed" || task.status === "cancelled") &&
              "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>
        {task.description ? (
          <p className="mt-1 line-clamp-2 break-words whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        {showPrompt ? (
          <p className="mt-1 flex min-w-0 items-start gap-1 text-[10px] leading-relaxed text-muted-foreground/70">
            <MessageSquare className="mt-0.5 size-2.5 shrink-0" />
            <span className="min-w-0 truncate">{task.prompt}</span>
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
          <span>{task.status.replace("_", " ")}</span>
          <span>·</span>
          <span>{task.priority}</span>
        </div>
      </div>

      <div className="mt-0.5 flex shrink-0 items-center">
        {onRun ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-success"
            onClick={() => onRun(task)}
            disabled={busy || task.status === "in_progress"}
            aria-label={`Run task: ${task.title}`}
            title={
              task.status === "in_progress"
                ? "Task is running"
                : busy
                  ? "Wait for the current turn"
                  : "Run this task"
            }
          >
            <Play className="size-3" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => onEdit(task)}
          aria-label={`Edit task: ${task.title}`}
          title="Edit task"
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
  tasks,
  diff,
  className,
  hasRepo,
  planSteps = 0,
  onRunTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onImportPlan,
  onResolveConflicts,
  busy,
}: {
  tasks: Task[];
  diff: FileDiff[];
  className?: string;
  hasRepo: boolean;
  planSteps?: number;
  onRunTask?: (task: Task) => void;
  onCreateTask?: (input: TaskInput) => Promise<unknown>;
  onUpdateTask?: (id: string, input: Partial<TaskInput>) => Promise<unknown>;
  onDeleteTask?: (id: string) => Promise<void>;
  onImportPlan?: () => Promise<void>;
  onResolveConflicts?: () => void;
  busy?: boolean;
}) {
  const additions = diff.reduce((sum, file) => sum + file.additions, 0);
  const deletions = diff.reduce((sum, file) => sum + file.deletions, 0);
  const completed = tasks.filter((task) => task.status === "completed").length;
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

  const tab: "tasks" | "changes" =
    !hasRepo && selectedTab === "changes"
      ? "tasks"
      : (selectedTab ??
        (tasks.length > 0 || planSteps > 0 || !hasRepo ? "tasks" : "changes"));

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
    <div className={cn("flex h-full min-h-0 flex-col bg-muted/15", className)}>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSelectedTab(value as "tasks" | "changes")
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex items-center gap-1.5 border-b border-border/70 px-3 py-2.5">
          <TabsList className="min-w-0 flex-1">
            <TabsTrigger value="tasks" className="flex-1 gap-1.5 text-xs">
              <ListTodo className="size-3.5" />
              Tasks
              <span className="font-mono text-[10px] text-muted-foreground">
                {tasks.length ? `${completed}/${tasks.length}` : "0"}
              </span>
            </TabsTrigger>
            {hasRepo ? (
              <TabsTrigger value="changes" className="flex-1 gap-1.5 text-xs">
                <GitCompareArrows className="size-3.5" />
                Changes
                <span className="font-mono text-[10px] text-muted-foreground">
                  {diff.length || "0"}
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={openCreate}
            aria-label="New task"
            title="New task"
          >
            <Plus className="size-3.5" />
          </Button>
          {hasRepo && onResolveConflicts ? (
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
          <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:!block">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <CircleDot className="size-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No tasks yet. Add a task or import the steps from the latest
                  plan.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={openCreate} className="gap-1.5">
                    <Plus className="size-3.5" /> New task
                  </Button>
                  {planSteps > 0 && onImportPlan ? (
                    <Button
                      variant="outline"
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
                </div>
              </div>
            ) : (
              <>
                {planSteps > 0 && onImportPlan ? (
                  <div className="border-b border-border/50 p-2">
                    <Button
                      variant="outline"
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
                <ul className="w-full space-y-0.5 p-2">
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      busy={busy}
                      onRun={onRunTask}
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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
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
