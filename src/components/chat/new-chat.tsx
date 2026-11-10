"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bug,
  FlaskConical,
  FolderGit2,
  GitPullRequest,
  Loader2,
  Plus,
  Sparkles,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { BrandMark } from "@/components/brand";
import { FolderPicker } from "@/components/chat/folder-picker";
import { UsageCard } from "@/components/usage/usage-card";
import {
  ModelPicker,
  findModel,
  type ModelSelection,
} from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const suggestions = [
  {
    icon: Sparkles,
    title: "Explore the codebase",
    prompt:
      "Give me a tour of this codebase. What does it do, how is it structured, and where should I start?",
  },
  {
    icon: Bug,
    title: "Find and fix a bug",
    prompt:
      "Look for the most likely bug in the current uncommitted changes, explain it, and fix it.",
  },
  {
    icon: FlaskConical,
    title: "Write tests",
    prompt:
      "Identify the most important untested behavior in this project and write focused tests for it.",
  },
  {
    icon: GitPullRequest,
    title: "Review changes",
    prompt:
      "Review the uncommitted changes like a senior engineer. Point out correctness, security and performance issues.",
  },
];

export function NewChat() {
  const router = useRouter();
  const {
    createSession,
    sessions,
    pathInfo,
    health,
    models,
    defaultModel,
    harnessLabel,
  } = useAppData();
  const [creating, setCreating] = React.useState<string | null>(null);
  const [selectedModel, setSelectedModel] =
    React.useState<ModelSelection | null>(defaultModel);
  const [rootFolder, setRootFolder] = React.useState("");
  const [folderOpen, setFolderOpen] = React.useState(false);

  React.useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem("oc.defaultModel");
        if (saved) {
          const parsed = JSON.parse(saved) as ModelSelection;
          if (findModel(models, parsed)) {
            setSelectedModel(parsed);
          }
        }
      } catch {
        // ignore malformed storage
      }
      try {
        const savedRoot = window.localStorage.getItem("oc.rootFolder");
        setRootFolder(savedRoot?.trim() || "");
      } catch {
        setRootFolder("");
      }
    });
  }, [models]);

  function changeRootFolder(next: string) {
    const trimmed = next.trim();
    const fallback = pathInfo?.directory?.trim() ?? "";
    const normalize = (value: string) =>
      value.replace(/\\/g, "/").replace(/\/+$/, "");
    const value =
      trimmed && fallback && normalize(trimmed) === normalize(fallback)
        ? ""
        : trimmed;
    setRootFolder(value);
    try {
      if (value) window.localStorage.setItem("oc.rootFolder", value);
      else window.localStorage.removeItem("oc.rootFolder");
      toast.success(value ? "Root folder updated" : "Using the server default folder");
    } catch {
      toast.error("Could not save the root folder");
    }
  }

  function handleModelChange(next: ModelSelection | null) {
    setSelectedModel(next);
    try {
      if (next) {
        window.localStorage.setItem("oc.defaultModel", JSON.stringify(next));
      } else {
        window.localStorage.removeItem("oc.defaultModel");
      }
    } catch {
      // ignore storage failures
    }
  }

  async function start(prompt?: string) {
    if (creating) return;
    setCreating(prompt ?? "blank");
    try {
      const session = await createSession({
        directory: rootFolder.trim() || undefined,
      });
      const target = prompt
        ? `/chat/${session.id}?prompt=${encodeURIComponent(prompt)}`
        : `/chat/${session.id}`;
      router.push(target);
    } catch (error) {
      toast.error("Could not create a session", {
        description: error instanceof Error ? error.message : undefined,
      });
      setCreating(null);
    }
  }

  const recent = sessions.slice(0, 5);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-5 py-12">
        <div className="animate-in-up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/35 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
            <span
              className={cn(
                "size-1.5 rounded-full",
                health?.healthy ? "bg-success" : "bg-warning",
              )}
            />
            {health?.healthy
              ? `${harnessLabel} ${health.version} ready`
              : `${harnessLabel} offline`}
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono text-[10px]">
              {pathInfo?.directory ?? "workspace"}
            </span>
          </div>

          <div className="mb-8 flex items-start gap-4">
            <BrandMark className="mt-1 size-12 rounded-2xl" />
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                Start a new session.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Describe what you want to build, debug or understand. {harnessLabel} can
                read files, run commands and edit your project.
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void start()}
              disabled={Boolean(creating)}
              className="brand-glow h-10 gap-2 px-4"
            >
              {creating === "blank" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Start blank session
              <ArrowRight className="size-3.5 opacity-60" />
            </Button>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Terminal className="size-3.5" />
              or press <kbd className="rounded border border-border px-1 font-mono text-[10px]">N</kbd>
            </span>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-border/60 bg-card/30 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Default model
            </span>
            <span className="hidden text-[10px] text-muted-foreground/50 sm:inline">
              used for new conversations
            </span>
            <ModelPicker
              models={models}
              value={selectedModel}
              onChange={handleModelChange}
              allowDefault
              side="bottom"
              label="Default model for new conversations"
              className="ml-auto border border-border/60 bg-background/50"
            />
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[10px] border border-border/60 bg-card/30 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <FolderGit2 className="size-3.5" />
              Root folder
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/60"
              title={rootFolder || pathInfo?.directory}
            >
              {rootFolder || pathInfo?.directory || "server default"}
            </span>
            {rootFolder ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => changeRootFolder("")}
                disabled={Boolean(creating)}
              >
                Reset
              </Button>
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40">
                default
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFolderOpen(true)}
              disabled={Boolean(creating)}
            >
              Change
            </Button>
          </div>

          <UsageCard />

          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.title}
                type="button"
                disabled={Boolean(creating)}
                onClick={() => void start(suggestion.prompt)}
                className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/45 p-4 text-left transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-brand/30 hover:bg-card/70 disabled:opacity-60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-hover:border-brand/20 group-hover:bg-brand/10 group-hover:text-brand">
                  {creating === suggestion.prompt ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <suggestion.icon className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{suggestion.title}</span>
                  <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
                    {suggestion.prompt}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {recent.length > 0 ? (
            <div className="mt-10">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Recent sessions
                </h2>
              </div>
              <div className="glass-panel divide-y divide-white/6 overflow-hidden rounded-xl">
                {recent.map((session) => (
                  <Link
                    key={session.id}
                    href={`/chat/${session.id}`}
                    className="flex items-center gap-3 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-muted/40"
                  >
                    <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <span
                      className="font-mono text-[10px] text-muted-foreground/60"
                      suppressHydrationWarning
                    >
                      {new Date(session.time.updated).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground/40" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <FolderPicker
        open={folderOpen}
        onOpenChange={setFolderOpen}
        initialPath={rootFolder || pathInfo?.directory || ""}
        onChange={changeRootFolder}
      />
    </div>
  );
}
