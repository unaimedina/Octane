"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  File,
  FileCode2,
  FileDiff,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  WrapText,
} from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { DiffView } from "@/components/chat/diff-view";
import { CodeView } from "@/components/files/code-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiJson } from "@/lib/api";
import { languageForPath } from "@/lib/languages";
import type { File as FileStatus, FileContent, FileNode } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusBadge(status?: FileStatus) {
  if (!status) return null;
  if (status.status === "added") {
    return (
      <span className="font-mono text-[10px] text-success dark:text-success">A</span>
    );
  }
  if (status.status === "deleted") {
    return <span className="font-mono text-[10px] text-destructive dark:text-destructive">D</span>;
  }
  return <span className="font-mono text-[10px] text-warning dark:text-warning">M</span>;
}

function patchToUnified(content: FileContent): string | undefined {
  if (content.diff) return content.diff;
  if (!content.patch) return undefined;
  return content.patch.hunks
    .map(
      (hunk) =>
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n` +
        hunk.lines.join("\n"),
    )
    .join("\n");
}

export function FilesView({
  initialEntries,
  initialStatus,
  root,
}: {
  initialEntries: FileNode[];
  initialStatus: FileStatus[];
  root: string;
}) {
  const { subscribe } = useAppData();
  const [entries, setEntries] = React.useState(initialEntries);
  const [status, setStatus] = React.useState(initialStatus);
  const [currentPath, setCurrentPath] = React.useState("");
  const [loadingDir, setLoadingDir] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [content, setContent] = React.useState<FileContent | null>(null);
  const [loadingFile, setLoadingFile] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<string[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [tab, setTab] = React.useState<"browse" | "changes">("browse");
  const [view, setView] = React.useState<"file" | "diff">("file");
  const [wrap, setWrap] = React.useState(false);
  const refreshTimer = React.useRef<number | null>(null);

  const statusMap = React.useMemo(() => {
    const map = new Map<string, FileStatus>();
    for (const item of status) map.set(item.path.replace(/\\/g, "/"), item);
    return map;
  }, [status]);

  const loadDir = React.useCallback(async (path: string) => {
    setLoadingDir(true);
    try {
      const next = await apiJson<FileNode[]>(
        `/files${path ? `?path=${encodeURIComponent(path)}` : ""}`,
      );
      setEntries(next);
      setCurrentPath(path);
    } catch (error) {
      toast.error("Could not open directory", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingDir(false);
    }
  }, []);

  const loadFile = React.useCallback(async (path: string) => {
    setSelected(path);
    setLoadingFile(true);
    setView("file");
    try {
      const next = await apiJson<FileContent>(
        `/files/content?path=${encodeURIComponent(path)}`,
      );
      setContent(next);
      if (next.diff) setView("diff");
    } catch (error) {
      setContent(null);
      toast.error("Could not read file", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingFile(false);
    }
  }, []);

  const refreshStatus = React.useCallback(async () => {
    try {
      setStatus(await apiJson<FileStatus[]>("/files/status"));
    } catch {
      // ignore transient failures
    }
  }, []);

  React.useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type !== "file.edited" &&
          event.type !== "file.watcher.updated" &&
          event.type !== "session.idle"
        ) {
          return;
        }
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => {
          void refreshStatus();
          void loadDir(currentPath);
        }, 700);
      }),
    [subscribe, refreshStatus, loadDir, currentPath],
  );

  React.useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiJson<string[]>(
        `/files/find?query=${encodeURIComponent(query.trim())}&type=file&limit=60`,
      )
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const parentPath = currentPath.split("/").slice(0, -1).join("/");
  const breadcrumbs = currentPath ? currentPath.split("/") : [];

  const sorted = React.useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [entries],
  );

  const diff = content ? patchToUnified(content) : undefined;
  const language = selected ? languageForPath(selected) : null;

  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          "flex w-full min-w-0 flex-col border-r border-border/60 bg-muted/15 sm:w-[300px] sm:shrink-0",
          selected && "hidden sm:flex",
        )}
      >
        <div className="space-y-2.5 border-b border-border/60 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {tab === "browse" ? "Explorer" : "Changes"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                void refreshStatus();
                void loadDir(currentPath);
                if (selected) void loadFile(selected);
              }}
              aria-label="Refresh files"
            >
              <RefreshCw className={cn("size-3", loadingDir && "animate-spin")} />
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (value.trim()) {
                  setSearching(true);
                } else {
                  setSearchResults(null);
                  setSearching(false);
                }
              }}
              placeholder="Find a file…"
              className="h-8 pl-8 text-xs"
            />
            {searching ? (
              <Loader2 className="absolute right-2.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "browse" | "changes")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="browse" className="flex-1 text-xs">
                Browse
              </TabsTrigger>
              <TabsTrigger value="changes" className="flex-1 gap-1.5 text-xs">
                Changes
                {status.length ? (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {status.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {query.trim() ? (
            <div className="p-1.5">
              <div className="px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
                {searchResults?.length ?? 0} matches
              </div>
              {searchResults?.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No files found.
                </p>
              ) : (
                searchResults?.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => void loadFile(path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-muted/60",
                      selected === path && "bg-brand/10 text-foreground",
                    )}
                  >
                    <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{path}</span>
                  </button>
                ))
              )}
            </div>
          ) : tab === "browse" ? (
            <div className="p-1.5">
              {currentPath ? (
                <button
                  type="button"
                  onClick={() => void loadDir(parentPath)}
                  className="mb-0.5 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" /> ..
                </button>
              ) : null}

              {loadingDir ? (
                <div className="space-y-1.5 p-2">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <Skeleton key={index} className="h-6 w-full" />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  This directory is empty.
                </p>
              ) : (
                sorted.map((node) => {
                  const itemStatus = statusMap.get(node.path.replace(/\\/g, "/"));
                  return (
                    <button
                      key={node.path}
                      type="button"
                      onClick={() =>
                        node.type === "directory"
                          ? void loadDir(node.path)
                          : void loadFile(node.path)
                      }
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-muted/60",
                        selected === node.path && "bg-brand/10 text-foreground",
                        node.ignored && "opacity-45",
                      )}
                    >
                      {node.type === "directory" ? (
                        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <File className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {node.name}
                      </span>
                      {statusBadge(itemStatus)}
                      {node.type === "directory" ? (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground/30" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="p-1.5">
              {status.length === 0 ? (
                <p className="px-2 py-9 text-center text-xs text-muted-foreground">
                  No changed files. Everything is committed.
                </p>
              ) : (
                status.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => void loadFile(item.path)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                      selected === item.path && "bg-brand/10 text-foreground",
                    )}
                  >
                    <FileDiff className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px]">{item.path}</span>
                      <span className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-muted-foreground/60">
                        <span className="text-success dark:text-success">
                          +{item.added}
                        </span>
                        <span className="text-destructive dark:text-destructive">
                          -{item.removed}
                        </span>
                        <span className="uppercase">{item.status}</span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </ScrollArea>

        <div className="truncate border-t border-border/60 px-3 py-2 font-mono text-[9px] text-muted-foreground/50">
          {root}
        </div>
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col", !selected && "hidden sm:flex")}>
        {selected ? (
          <>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/20 px-3">
              <Button
                variant="ghost"
                size="icon-xs"
                className="sm:hidden"
                onClick={() => setSelected(null)}
                aria-label="Back to files"
              >
                <ArrowLeft className="size-3.5" />
              </Button>
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-[11px] text-muted-foreground">
                {breadcrumbs.length > 0 ? (
                  breadcrumbs.slice(0, -1).map((part) => (
                    <React.Fragment key={part}>
                      <span className="truncate">{part}</span>
                      <ChevronRight className="size-3 shrink-0 opacity-40" />
                    </React.Fragment>
                  ))
                ) : null}
                <span className="truncate font-medium text-foreground">
                  {breadcrumbs.at(-1) ?? selected}
                </span>
              </div>

              <Badge variant="outline" className="font-mono text-[9px] uppercase">
                {content?.type === "binary" ? "binary" : language?.name ?? "text"}
              </Badge>
              {diff ? (
                <Tabs value={view} onValueChange={(value) => setView(value as "file" | "diff")}>
                  <TabsList>
                    <TabsTrigger value="file" className="text-[11px]">
                      File
                    </TabsTrigger>
                    <TabsTrigger value="diff" className="text-[11px]">
                      Diff
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : null}

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setWrap((value) => !value)}
                aria-label="Toggle line wrapping"
                className={cn(wrap && "bg-muted")}
              >
                <WrapText className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(selected)
                    .then(() => toast.success("Path copied"))
                }
                aria-label="Copy path"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>

            <div className="min-h-0 flex-1">
              {loadingFile ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 14 }).map((_, index) => (
                    <Skeleton key={index} className="h-4 w-full" />
                  ))}
                </div>
              ) : content?.type === "binary" ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <File className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Binary file</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {content.mimeType ?? "This file"} cannot be displayed as text.
                  </p>
                </div>
              ) : view === "diff" && diff ? (
                <div className="scrollbar-thin h-full overflow-y-auto p-4">
                  <DiffView diff={diff} file={selected} className="border-border/70" />
                </div>
              ) : (
                <CodeView
                  content={content?.content ?? ""}
                  wrap={wrap}
                  path={selected}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl border border-border/70 bg-muted/30">
              <FileCode2 className="size-5 text-muted-foreground/60" />
            </div>
            <div>
              <p className="text-sm font-medium">Select a file to inspect it</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Browse the project tree, search by name, or review uncommitted
                changes. Files open read-only — edit them through an agent.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {status.length} changed file{status.length === 1 ? "" : "s"}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
