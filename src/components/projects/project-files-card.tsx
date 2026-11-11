"use client";

import * as React from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { CONTEXT_EXTENSIONS } from "@/lib/agents-block";
import { ApiError, apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project, ProjectContextFile } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT = CONTEXT_EXTENSIONS.join(",");

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectFilesCard({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const [files, setFiles] = React.useState<ProjectContextFile[] | null>(null);
  const [unavailable, setUnavailable] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<string[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectContextFile | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    apiJson<{ files: ProjectContextFile[] }>(`/projects/${project.id}/files`)
      .then((data) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === "project_files_unavailable") {
          setUnavailable(error.message);
        } else {
          toast.error("Could not load context files", {
            description: error instanceof Error ? error.message : undefined,
          });
          setFiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function uploadAll(selected: File[]) {
    let changed = false;
    for (const file of selected) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is too large`, {
          description: "Files must be 5 MB or smaller.",
        });
        continue;
      }
      setUploading((current) => [...current, file.name]);
      try {
        const form = new FormData();
        form.set("file", file);
        const result = await apiJson<{ file: ProjectContextFile; files: ProjectContextFile[] }>(
          `/projects/${project.id}/files`,
          { method: "POST", body: form },
        );
        setFiles(result.files);
        changed = true;
      } catch (error) {
        toast.error(`Could not upload ${file.name}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setUploading((current) => {
          const index = current.indexOf(file.name);
          return index === -1 ? current : current.filter((_, i) => i !== index);
        });
      }
    }
    if (changed) onChanged();
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiJson<void>(
        `/projects/${project.id}/files/${encodeURIComponent(deleteTarget.name)}`,
        { method: "DELETE" },
      );
      setFiles((current) => current?.filter((file) => file.name !== deleteTarget.name) ?? null);
      setDeleteTarget(null);
      onChanged();
    } catch (error) {
      toast.error("Could not delete the file", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Context files</CardTitle>
        <CardDescription className="text-xs">
          Reference material the agent can read: specs, data, notes, images.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {unavailable ? (
          <p className="rounded-[10px] border border-dashed border-border/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {unavailable}
          </p>
        ) : (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void uploadAll(Array.from(event.dataTransfer.files));
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-[10px] border border-dashed px-4 py-6 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border/60",
              )}
            >
              <Upload className="size-5 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Drop files here or
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                Choose files
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (selected.length) void uploadAll(selected);
                }}
              />
            </div>

            {files === null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading
              </div>
            ) : files.length === 0 && uploading.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                No context files yet.
              </p>
            ) : (
              <div className="divide-y divide-border/50 overflow-hidden rounded-[10px] border border-border/60">
                {files.map((file) => (
                  <div key={file.name} className="flex items-center gap-3 px-3 py-2">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                      {file.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                      {formatSize(file.size)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${file.name}`}
                      className="text-destructive"
                      onClick={() => setDeleteTarget(file)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
                {uploading.map((name, index) => (
                  <div key={`${name}-${index}`} className="flex items-center gap-3 px-3 py-2">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Files are saved in <code>.octane/context/</code> inside the project
              folder and listed in AGENTS.md so the agent can read them. Add{" "}
              <code>.octane/</code> to .gitignore if you don&apos;t want to commit
              them. Up to 5 MB per file, 50 files, 50 MB total.
            </p>
          </>
        )}
      </CardContent>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this context file?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be removed from the project folder and
              from the AGENTS.md list.
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
    </Card>
  );
}
