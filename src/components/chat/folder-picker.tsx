"use client";

import * as React from "react";
import { ArrowUp, Check, Folder, FolderOpen, Loader2 } from "lucide-react";
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
import type { FileNode } from "@/lib/types";

function parentOf(value: string): string {
  const normalized = value.replace(/[\\/]+$/, "");
  if (!normalized) return "";
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (index <= 0) return normalized.startsWith("/") ? "/" : "";
  const parent = normalized.slice(0, index);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

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
  const [path, setPath] = React.useState(initialPath);
  const [directories, setDirectories] = React.useState<FileNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const entries = await apiJson<FileNode[]>(
        `/files${target.trim() ? `?path=${encodeURIComponent(target.trim())}` : ""}`,
      );
      setDirectories(entries.filter((entry) => entry.type === "directory"));
      setPath(target);
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
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const target = initialPath;
    queueMicrotask(() => {
      setPath(target);
      void load(target);
    });
  }, [open, initialPath, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="size-4" /> Choose root folder
          </DialogTitle>
          <DialogDescription>
            The agent will run sessions inside this directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void load(path);
                }
              }}
              placeholder="/path/to/project"
              className="font-mono text-xs"
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

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(parentOf(path))}
              disabled={loading || !path}
            >
              <ArrowUp className="size-3.5" /> Up
            </Button>
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
              {path || "server default"}
            </span>
          </div>

          <div className="rounded-[10px] border border-border/60 bg-card/30">
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
                      onClick={() => void load(directory.path)}
                      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-muted/60"
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onChange(path.trim());
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
