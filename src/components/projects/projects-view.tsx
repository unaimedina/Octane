"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { Button } from "@/components/ui/button";
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
            <h1 className="headline text-[26px] leading-tight">Projects</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Group sessions by folder and share an AGENTS.md with every chat.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> New project
          </Button>
        </div>

        {storageEphemeral ? (
          <div
            className="mb-6 rounded-sm border-l-2 border-destructive bg-destructive/8 px-3 py-2 text-xs"
            role="alert"
          >
            <p className="flex items-center gap-1.5 font-medium text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" />
              Projects are not being saved permanently
            </p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              The server stores projects, tasks and GitHub connections inside the
              container, not on a volume. They will be lost the next time the
              container is recreated, for example after pulling a new image. Ask
              your administrator to mount a volume at the OCTANE data folder
              (see README › Docker notes).
            </p>
          </div>
        ) : null}

        <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[13px] font-medium">GitHub account</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {githubState.connected
                  ? "Used to verify and link repositories to projects."
                  : "Optional. Link verified repositories to projects."}
              </p>
            </div>
            {githubState.connected ? (
              <div className="flex items-center gap-2.5">
                <Avatar size="sm">
                  {githubState.avatarUrl ? (
                    <AvatarImage src={githubState.avatarUrl} alt={githubState.login ?? "GitHub"} />
                  ) : null}
                  <AvatarFallback>
                    {(githubState.login ?? "G").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-[11px]">@{githubState.login ?? "github"}</span>
                <span className="status-square bg-success" aria-label="Connected" role="img" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void disconnectGithub()}
                  disabled={disconnecting}
                >
                  {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Disconnect
                </Button>
              </div>
            ) : githubState.configured ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Not connected</span>
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/github/connect?next=/projects">
                    <GitBranch className="size-3.5" /> Connect GitHub
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
          {!githubState.connected && !githubState.configured ? (
            <p className="mt-3 rounded-sm border-l-2 border-muted-foreground/40 bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              GitHub is not configured on this deployment. Set{" "}
              <span className="font-mono">GITHUB_CLIENT_ID</span> and{" "}
              <span className="font-mono">GITHUB_CLIENT_SECRET</span> to enable
              repository links. Projects work without it.
            </p>
          ) : githubState.configured && !githubState.connected ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Connect GitHub to verify repository access before linking it.
            </p>
          ) : null}
        </section>

        <section className="border-t border-border py-6">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <FolderKanban className="size-5 text-muted-foreground/60" aria-hidden="true" />
              <h2 className="mt-3 text-[13px] font-medium">No projects yet</h2>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Create a project to group sessions around a folder and give every
                new chat the same background.
              </p>
              <Button onClick={openCreate} className="mt-4 gap-2">
                <Plus className="size-4" /> New project
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {projects.map((project) => {
                const sessionCount = projectSessions(project, sessions).length;
                return (
                  <li
                    key={project.id}
                    className="relative flex flex-wrap items-center gap-x-6 gap-y-1.5 px-3 py-3 transition-colors hover:bg-accent/50 sm:flex-nowrap"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${project.id}`}
                        className="block truncate rounded-sm text-[13px] font-medium outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {project.name}
                      </Link>
                      {project.description ? (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {project.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground sm:max-w-[60%] sm:flex-nowrap">
                      <span className="min-w-0 max-w-[260px] truncate" title={project.directory}>
                        {project.directory}
                      </span>
                      {project.github ? (
                        <a
                          href={project.github.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <GitBranch className="size-3" />
                          {project.github.repo}
                        </a>
                      ) : null}
                      <span className="shrink-0">
                        {sessionCount} session{sessionCount === 1 ? "" : "s"}
                      </span>
                      <span className="shrink-0" suppressHydrationWarning>
                        Updated{" "}
                        {new Date(project.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="relative z-10 flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${project.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(project);
                          }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${project.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(project);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
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
