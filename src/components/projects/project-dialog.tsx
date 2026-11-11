"use client";

import * as React from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FolderPicker } from "@/components/chat/folder-picker";
import { GithubRepoPicker } from "@/components/projects/github-repo-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { apiJson, jsonBody } from "@/lib/api";
import { isAbsoluteProjectDirectory } from "@/lib/project-paths";
import type { GithubStatus, Project } from "@/lib/types";

const MAX_CONTEXT = 20_000;

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  defaultDirectory,
  github,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  defaultDirectory?: string;
  github: GithubStatus;
  onSaved: (project: Project) => void;
}) {
  const [name, setName] = React.useState(project?.name ?? "");
  const [description, setDescription] = React.useState(
    project?.description ?? "",
  );
  const [directory, setDirectory] = React.useState(
    project?.directory ?? defaultDirectory ?? "",
  );
  const [context, setContext] = React.useState(project?.context ?? "");
  const [selectedRepo, setSelectedRepo] = React.useState<string | undefined>(
    project?.github?.repo,
  );
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const directoryValid = isAbsoluteProjectDirectory(directory);
  const canSave =
    name.trim().length > 0 &&
    directoryValid &&
    context.length <= MAX_CONTEXT &&
    !saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!directoryValid) {
      setError("Choose an absolute folder path.");
      return;
    }
    if (context.length > MAX_CONTEXT) {
      setError("Project context is too long.");
      return;
    }

    setSaving(true);
    setError(null);
    const currentRepo = project?.github?.repo;
    const githubPatch =
      selectedRepo === currentRepo
        ? undefined
        : selectedRepo
          ? { repo: selectedRepo }
          : null;

    const body = {
      name: name.trim(),
      description: description.trim(),
      directory: directory.trim(),
      context,
      ...(githubPatch !== undefined ? { github: githubPatch } : {}),
    };

    try {
      const saved = project
        ? await apiJson<Project>(`/projects/${project.id}`, {
            method: "PATCH",
            ...jsonBody(body),
          })
        : await apiJson<Project>("/projects", {
            method: "POST",
            ...jsonBody(body),
          });
      onSaved(saved);
      onOpenChange(false);
      toast.success(project ? "Project updated" : "Project created");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>
              Group sessions around one folder and keep shared instructions for
              every new chat.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="project-name" className="text-xs font-medium">
                Name
              </label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Octane"
                maxLength={80}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="project-description" className="text-xs font-medium">
                Description{" "}
                <span className="font-normal text-muted-foreground">optional</span>
              </label>
              <Input
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this project is about"
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="project-directory" className="text-xs font-medium">
                Local directory
              </label>
              <div className="flex gap-2">
                <Input
                  id="project-directory"
                  value={directory}
                  readOnly
                  placeholder="/workspace/project"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFolderOpen(true)}
                >
                  <FolderOpen className="size-3.5" /> Browse
                </Button>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Absolute path inside the OpenCode container, not on the host.
                Changing it re-groups existing sessions; files are never moved.
              </p>
              {!directoryValid ? (
                <p className="text-[10px] text-destructive">
                  Choose an absolute folder to continue.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="project-context" className="text-xs font-medium">
                  Global context{" "}
                  <span className="font-normal text-muted-foreground">optional</span>
                </label>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {context.length.toLocaleString("en-US")} /{" "}
                  {MAX_CONTEXT.toLocaleString("en-US")}
                </span>
              </div>
              <Textarea
                id="project-context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Useful instructions, conventions or background for every new session in this project."
                className="min-h-28"
                maxLength={MAX_CONTEXT}
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Added as a synthetic message to sessions created from this
                project. Existing sessions keep their original context.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium">
                GitHub repository{" "}
                <span className="font-normal text-muted-foreground">optional</span>
              </span>
              <GithubRepoPicker
                github={github}
                value={selectedRepo ? { repo: selectedRepo } : undefined}
                onChange={(next) => setSelectedRepo(next?.repo)}
              />
            </div>

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
                {project ? "Save changes" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FolderPicker
        open={folderOpen}
        onOpenChange={setFolderOpen}
        initialPath={directory || defaultDirectory || ""}
        onChange={(path) => {
          if (path.trim()) setDirectory(path.trim());
        }}
        allowDefault={false}
      />
    </>
  );
}
