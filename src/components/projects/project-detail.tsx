"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  FolderGit2,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { ProjectAgentsCard } from "@/components/projects/project-agents-card";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ProjectFilesCard } from "@/components/projects/project-files-card";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiJson } from "@/lib/api";
import { projectSessions } from "@/lib/project-paths";
import type { GithubStatus, Project, Session } from "@/lib/types";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProjectDetail({
  initialProject,
  github,
}: {
  initialProject: Project;
  github: GithubStatus;
}) {
  const router = useRouter();
  const { sessions, refreshSessions } = useAppData();
  const [project, setProject] = React.useState(initialProject);
  const [editing, setEditing] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const related = React.useMemo(
    () =>
      projectSessions(project, sessions).sort(
        (a, b) => b.time.updated - a.time.updated,
      ),
    [project, sessions],
  );

  async function startSession() {
    if (creating) return;
    setCreating(true);
    try {
      const session = await apiJson<Session>(
        `/projects/${project.id}/sessions`,
        { method: "POST" },
      );
      await refreshSessions();
      router.push(`/chat/${session.id}`);
    } catch (error) {
      toast.error("Could not create a project session", {
        description: error instanceof Error ? error.message : undefined,
      });
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await apiJson<void>(`/projects/${project.id}`, { method: "DELETE" });
      toast.success("Project deleted", {
        description: "Sessions and files were not deleted.",
      });
      router.push("/projects");
    } catch (error) {
      toast.error("Could not delete the project", {
        description: error instanceof Error ? error.message : undefined,
      });
      setDeleting(false);
    }
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Button variant="ghost" size="sm" className="mb-4 -ml-1 gap-1.5" asChild>
          <Link href="/projects">
            <ArrowLeft className="size-3.5" /> Projects
          </Link>
        </Button>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em]">
              {project.name}
            </h1>
            {project.description ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {project.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="gap-1.5"
            >
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="gap-1.5 text-destructive"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button
              size="sm"
              onClick={() => void startSession()}
              disabled={creating}
              className="gap-1.5"
            >
              {creating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              New chat
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <ProjectAgentsCard
              project={project}
              reloadKey={reloadKey}
              onProjectChange={setProject}
            />

            <ProjectFilesCard
              project={project}
              onChanged={() => setReloadKey((key) => key + 1)}
            />

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">Sessions</CardTitle>
                    <CardDescription className="text-xs">
                      Conversations running in this project folder.
                    </CardDescription>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {related.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {related.length === 0 ? (
                  <div className="flex flex-col items-center rounded-[10px] border border-dashed border-border/60 px-4 py-10 text-center">
                    <FolderGit2 className="mb-2 size-5 text-muted-foreground/60" />
                    <p className="text-xs text-muted-foreground">
                      No sessions in this folder yet.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 gap-1.5"
                      onClick={() => void startSession()}
                      disabled={creating}
                    >
                      <Plus className="size-3.5" /> New chat
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50 overflow-hidden rounded-[10px] border border-border/60">
                    {related.map((session) => (
                      <Link
                        key={session.id}
                        href={`/chat/${session.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {session.title || "Untitled session"}
                        </span>
                        <span
                          className="shrink-0 font-mono text-[10px] text-muted-foreground/60"
                          suppressHydrationWarning
                        >
                          {formatDate(session.time.updated)}
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    Directory
                  </div>
                  <div className="mt-1 break-all rounded-[8px] border border-border/50 bg-muted/20 px-2 py-1.5 font-mono text-[10px]">
                    {project.directory}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    Repository
                  </div>
                  {project.github ? (
                    <a
                      href={project.github.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-[8px] border border-border/60 px-2 py-1 font-mono text-[10px] transition-colors hover:bg-muted/60"
                    >
                      <GitBranch className="size-3 shrink-0" />
                      <span className="truncate">{project.github.repo}</span>
                    </a>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      No repository linked
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <CalendarDays className="size-3" />
                  <span suppressHydrationWarning>
                    Created {formatDate(project.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <CalendarDays className="size-3" />
                  <span suppressHydrationWarning>
                    Updated {formatDate(project.updatedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {!github.configured ? (
              <p className="rounded-[10px] border border-dashed border-border/60 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
                GitHub is not configured on this deployment.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {editing ? (
        <ProjectDialog
          open={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          project={project}
          defaultDirectory={project.directory}
          github={github}
          onSaved={(saved) => {
            setProject(saved);
          }}
        />
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              “{project.name}” will be removed. Sessions and files are not
              deleted; only the project grouping is removed.
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
}
