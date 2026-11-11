"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Task, TaskInput, TaskPriority, TaskStatus } from "@/lib/types";

const MAX_TITLE = 500;
const MAX_TEXT = 20_000;

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function TaskDialog({
  open,
  onOpenChange,
  task,
  tasks,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  tasks: Task[];
  onSave: (input: TaskInput) => Promise<void>;
}) {
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [prompt, setPrompt] = React.useState(task?.prompt ?? "");
  const [priority, setPriority] = React.useState<TaskPriority>(
    task?.priority ?? "medium",
  );
  const [status, setStatus] = React.useState<TaskStatus>(
    task?.status ?? "pending",
  );
  const [dependsOn, setDependsOn] = React.useState<string[]>(
    task?.dependsOn ?? [],
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSave = title.trim().length > 0 && !saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        description,
        prompt,
        priority,
        status,
        dependsOn,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the task.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            A task has a definition for the list and its own prompt for the
            agent. Run it when you want the agent to execute that part.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Task</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add the tasks panel"
              maxLength={MAX_TITLE}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Definition</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this task means, constraints, acceptance criteria…"
              className="min-h-24"
              maxLength={MAX_TEXT}
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Shown in the task list and included before the prompt when the task
              runs. Optional.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-prompt">Prompt</Label>
            <Textarea
              id="task-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Execute this task. Work only on this part and report what you changed."
              className="min-h-28"
              maxLength={MAX_TEXT}
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Sent to the agent when you press Run. If empty, the definition is
              used. Optional.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as TaskPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS)
                    .filter(([value]) => value !== "in_progress")
                    .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tasks.some((item) => item.id !== task?.id) ? (
            <div className="space-y-1.5">
              <Label>Depends on</Label>
              <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-[10px] border border-border/60 p-1.5">
                {tasks.map((item, position) =>
                  item.id === task?.id ? null : (
                    <label
                      key={item.id}
                      className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={dependsOn.includes(item.id)}
                        onChange={(event) =>
                          setDependsOn((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-muted-foreground">
                          #{position + 1}
                        </span>{" "}
                        {item.title}
                      </span>
                    </label>
                  ),
                )}
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                The task can run once every selected task is completed.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {task ? "Save task" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
