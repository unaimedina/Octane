"use client";

import * as React from "react";
import { ArrowUp, Check, Folder, Home, Loader2 } from "lucide-react";
import { useAppData } from "@/components/app-data";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiJson } from "@/lib/api";
import { cleanPath, parentPath, pathSegments, resolveAgainst } from "@/lib/folder-paths";
import { isAbsoluteProjectDirectory } from "@/lib/project-paths";
import type { FileNode } from "@/lib/types";

export function FolderPicker({
  open,
  onOpenChange,
  initialPath,
  onChange,
  allowDefault = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPath: string;
  onChange: (path: string) => void;
  allowDefault?: boolean;
}) {
  const { pathInfo } = useAppData();
  const root = cleanPath(pathInfo?.directory ?? "");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [path, setPath] = React.useState(initialPath);
  const [directories, setDirectories] = React.useState<FileNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        const absolute = resolveAgainst(root, target.trim()) || target.trim();
        const entries = await apiJson<FileNode[]>(
          `/files${absolute ? `?path=${encodeURIComponent(absolute)}` : ""}`,
        );
        setDirectories(entries.filter((entry) => entry.type === "directory"));
        setPath(absolute);
      } catch (cause) {
        setDirectories([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not list that folder.",
        );
      } finally {
        setLoading(false);
      }
    },
    [root],
  );

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    input.scrollLeft = input.scrollWidth;
  }, [path]);

  React.useEffect(() => {
    if (!open) return;
    const target = initialPath || root;
    queueMicrotask(() => {
      setPath(target);
      void load(target);
    });
  }, [open, initialPath, root, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline text-[20px]">Choose root folder</DialogTitle>
          <DialogDescription>
            The agent will run sessions inside this directory.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 gap-2">
            <Input
              ref={inputRef}
              title={path}
              value={path}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void load(path);
                }
              }}
              placeholder={root ? `${root}/…` : "/path/to/project"}
              className="min-w-0 flex-1 font-mono text-xs"
              spellCheck={false}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(path)}
              disabled={loading}
            >
              Go
            </Button>
          </div>

          {root ? (
            <p className="text-[11px] text-muted-foreground">
              Paths are inside the OpenCode container. The workspace root is{" "}
              <code className="font-mono">{root}</code>.
            </p>
          ) : null}

          <div className="flex min-w-0 items-start gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(parentPath(path))}
              disabled={loading || !path || parentPath(path) === cleanPath(path)}
            >
              <ArrowUp className="size-3.5" /> Up
            </Button>
            {root ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void load(root)}
                disabled={loading || cleanPath(path) === root}
              >
                <Home className="size-3.5" /> Workspace
              </Button>
            ) : null}
            <nav
              aria-label="Current folder"
              className="flex max-h-12 min-w-0 flex-1 flex-wrap items-center gap-x-0.5 self-center overflow-y-auto font-mono text-[10px] text-muted-foreground"
            >
              {pathSegments(path).map((segment, index, all) => {
                const last = index === all.length - 1;
                return (
                  <React.Fragment key={segment.path}>
                    {index > 0 && all[index - 1].label !== "/" ? (
                      <span aria-hidden>/</span>
                    ) : null}
                    {last ? (
                      <span className="break-all px-0.5 text-foreground">{segment.label}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void load(segment.path)}
                        className="max-w-full break-all rounded-sm px-0.5 text-left hover:bg-accent/60 hover:text-foreground"
                      >
                        {segment.label}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
              {!path ? "server default" : null}
            </nav>
          </div>

          <div className="rounded-md border border-border bg-card">
            <ScrollArea className="h-64">
              {loading ? (
                <div className="flex h-64 items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading folders…
                </div>
              ) : error ? (
                <div className="flex h-64 items-center justify-center px-6 text-center text-xs text-destructive">
                  {error}
                </div>
              ) : directories.length === 0 ? (
                <div className="flex h-64 items-center justify-center px-6 text-center text-xs text-muted-foreground">
                  No subfolders here. You can still use this path.
                </div>
              ) : (
                <div className="p-1.5">
                  {directories.map((directory) => (
                    <button
                      key={directory.path}
                      type="button"
                      title={directory.name}
                      onClick={() =>
                        void load(
                          directory.absolute &&
                            isAbsoluteProjectDirectory(directory.absolute)
                            ? directory.absolute
                            : resolveAgainst(path, directory.name),
                        )
                      }
                      className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-[12px] transition-colors hover:bg-accent/60"
                    >
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{directory.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          {allowDefault ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                onChange("");
                onOpenChange(false);
              }}
            >
              Use server default
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onChange(resolveAgainst(root, path.trim()) || path.trim());
              onOpenChange(false);
            }}
            disabled={!path.trim()}
          >
            <Check className="size-4" /> Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
