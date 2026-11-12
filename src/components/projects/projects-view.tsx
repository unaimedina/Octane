"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FolderKanban,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { ProjectDialog } from "@/components/projects/project-dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiJson } from "@/lib/api";
import { projectSessions } from "@/lib/project-paths";
import type { GithubStatus, Project } from "@/lib/types";

const GITHUB_MESSAGES: Record<string, { title: string; description?: string }> = {
  connected: { title: "GitHub connected" },
  not_configured: {
    title: "GitHub is not configured",
    description: "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the server.",
  },
  access_denied: { title: "GitHub authorization was cancelled" },
  state_mismatch: {
    title: "GitHub connection expired",
    description: "Start the connection again from Projects.",
  },
  github_error: { title: "GitHub connection failed" },
};

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ProjectsView({
  initialProjects,
  github,
  storageEphemeral = false,
}: {
  initialProjects: Project[];
  github: GithubStatus;
  storageEphemeral?: boolean;
}) {
  const router = useRouter();
  const { sessions, pathInfo } = useAppData();
  const [projects, setProjects] = React.useState(() => sortProjects(initialProjects));
  const [githubState, setGithubState] = React.useState(github);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Project | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github");
    if (!status) return;
    const message = GITHUB_MESSAGES[status] ?? {
      title: "GitHub request failed",
    };
    if (status === "connected") {
      toast.success(message.title, { description: message.description });
    } else {
      toast.error(message.title, { description: message.description });
    }
    window.history.replaceState({}, "", "/projects");
    // The query param is consumed once on mount; React strict mode may replay
    // this effect, so remove it before the second run can toast again.
  }, []);

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setDialogOpen(true);
  }

  function handleSaved(saved: Project) {
    setProjects((current) => {
      const exists = current.some((project) => project.id === saved.id);
      return sortProjects(
        exists
          ? current.map((project) => (project.id === saved.id ? saved : project))
          : [saved, ...current],
      );
    });
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiJson<void>(`/projects/${deleteTarget.id}`, { method: "DELETE" });
      setProjects((current) =>
        current.filter((project) => project.id !== deleteTarget.id),
      );
      toast.success("Project deleted", {
        description: "Sessions and files were not deleted.",
      });
      setDeleteTarget(null);
    } catch (error) {
      toast.error("Could not delete the project", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  async function disconnectGithub() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await apiJson<void>("/github/disconnect", { method: "POST" });
      setGithubState((current) => ({ ...current, connected: false }));
      toast.success("GitHub disconnected", {
        description: "Project repository links are kept as metadata.",
      });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error("Could not disconnect GitHub", {
          description: error.message,
        });
      } else {
        toast.error("Could not disconnect GitHub");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Group sessions by folder and share an AGENTS.md with every chat.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> New project
          </Button>
        </div>

        {storageEphemeral ? (
          <Card className="mb-5 border-destructive/50 bg-destructive/5" role="alert">
            <CardHeader>
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm">Projects are not being saved permanently</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    The server stores projects, tasks and GitHub connections inside the
                    container, not on a volume. They will be lost the next time the
                    container is recreated, for example after pulling a new image. Ask
                    your administrator to mount a volume at the OCTANE data folder
                    (see README › Docker notes).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ) : null}

        <Card className="mb-5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border/60 bg-muted/30">
                <GitBranch className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm">GitHub account</CardTitle>
                <CardDescription className="text-xs">
                  {githubState.connected
                    ? "Used to verify and link repositories to projects."
                    : "Optional. Link verified repositories to projects."}
                </CardDescription>
              </div>
              {githubState.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void disconnectGithub()}
                  disabled={disconnecting}
                >
                  {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Disconnect
                </Button>
              ) : githubState.configured ? (
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/github/connect?next=/projects">
                    <GitBranch className="size-3.5" /> Connect GitHub
                  </a>
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-xs">
            {githubState.connected ? (
              <>
                <Avatar size="sm">
                  {githubState.avatarUrl ? (
                    <AvatarImage
                      src={githubState.avatarUrl}
                      alt={githubState.login ?? "GitHub"}
                    />
                  ) : null}
                  <AvatarFallback>
                    {(githubState.login ?? "G").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-[11px]">
                  @{githubState.login ?? "github"}
                </span>
                <Badge variant="secondary" className="font-mono text-[9px]">
                  connected
                </Badge>
              </>
            ) : githubState.configured ? (
              <span className="text-muted-foreground">
                Connect GitHub to verify repository access before linking it.
              </span>
            ) : (
              <span className="rounded-[10px] border border-dashed border-border/60 bg-muted/15 px-2.5 py-2 leading-relaxed text-muted-foreground">
                GitHub is not configured on this deployment. Set{" "}
                <span className="font-mono">GITHUB_CLIENT_ID</span> and{" "}
                <span className="font-mono">GITHUB_CLIENT_SECRET</span> to enable
                repository links. Projects work without it.
              </span>
            )}
          </CardContent>
        </Card>

        {projects.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-border/60 bg-muted/30 text-muted-foreground">
              <FolderKanban className="size-6" />
            </div>
            <h2 className="text-base font-semibold">No projects yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create a project to group sessions around a folder and give every
              new chat the same background.
            </p>
            <Button onClick={openCreate} className="mt-4 gap-2">
              <Plus className="size-4" /> New project
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => {
              const sessionCount = projectSessions(project, sessions).length;
              return (
                <Card key={project.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-base">
                          {project.name}
                        </CardTitle>
                        {project.description ? (
                          <CardDescription className="mt-0.5 line-clamp-2 text-xs">
                            {project.description}
                          </CardDescription>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${project.name}`}
                          onClick={() => openEdit(project)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${project.name}`}
                          onClick={() => setDeleteTarget(project)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                    <div
                      className="truncate rounded-[8px] border border-border/50 bg-muted/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground"
                      title={project.directory}
                    >
                      {project.directory}
                    </div>

                    {project.description ? (
                      <p className="line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                        {project.description}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      {project.github ? (
                        <a
                          href={project.github.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 font-mono text-[10px] transition-colors hover:bg-muted/60"
                        >
                          <GitBranch className="size-2.5" />
                          {project.github.repo}
                        </a>
                      ) : null}
                      <span className="font-mono">
                        {sessionCount} session{sessionCount === 1 ? "" : "s"}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span suppressHydrationWarning>
                        Updated{" "}
                        {new Date(project.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <Button variant="outline" size="sm" className="w-full justify-between" asChild>
                      <Link href={`/projects/${project.id}`}>
                        Open project <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {dialogOpen ? (
        <ProjectDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditing(undefined);
          }}
          project={editing}
          defaultDirectory={pathInfo?.directory ?? ""}
          github={githubState}
          onSaved={handleSaved}
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
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be removed from this workspace. Sessions
              and files are not deleted; only the project grouping is removed.
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
