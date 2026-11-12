"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
            <h1 className="headline truncate text-[26px] leading-tight">{project.name}</h1>
            {project.description ? (
              <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
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

        <Tabs defaultValue="sessions">
          <TabsList className="mb-4">
            <TabsTrigger value="sessions" className="gap-1.5 text-[13px]">
              Sessions
              <span className="font-mono text-[11px] text-muted-foreground">{related.length}</span>
            </TabsTrigger>
            <TabsTrigger value="details" className="text-[13px]">
              Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions">
            {related.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <FolderGit2 className="size-5 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-3 text-xs text-muted-foreground">
                  No sessions in this folder yet.
                </p>
                <Button
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={() => void startSession()}
                  disabled={creating}
                >
                  <Plus className="size-3.5" /> New chat
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {related.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/chat/${session.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="status-square bg-muted-foreground/30" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {session.title || "Untitled session"}
                      </span>
                      <span
                        className="shrink-0 font-mono text-[11px] text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {formatDate(session.time.updated)}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* forceMount keeps an unsaved AGENTS.md draft when switching tabs. */}
          <TabsContent value="details" forceMount className="data-[state=inactive]:hidden">
            <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
              <h2 className="mb-3 text-[13px] font-medium">Repository</h2>
              <p className="break-all font-mono text-[11px] text-foreground">{project.directory}</p>
              {project.github ? (
                <a
                  href={project.github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-sm font-mono text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <GitBranch className="size-3 shrink-0" />
                  <span className="truncate">{project.github.repo}</span>
                </a>
              ) : (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  No repository linked
                  <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                </p>
              )}
              {!github.configured ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  GitHub is not configured on this deployment.
                </p>
              ) : null}
            </section>

            <ProjectAgentsCard
              project={project}
              reloadKey={reloadKey}
              onProjectChange={setProject}
            />

            <ProjectFilesCard
              project={project}
              onChanged={() => setReloadKey((key) => key + 1)}
            />

            <section className="border-t border-border py-6">
              <h2 className="mb-3 text-[13px] font-medium">Dates</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-mono" suppressHydrationWarning>
                  {formatDate(project.createdAt)}
                </dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="font-mono" suppressHydrationWarning>
                  {formatDate(project.updatedAt)}
                </dd>
              </dl>
            </section>
          </TabsContent>
        </Tabs>
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
