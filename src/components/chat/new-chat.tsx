"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, FolderGit2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { AsciiEmblem } from "@/components/chat/ascii-emblem";
import { FolderPicker } from "@/components/chat/folder-picker";
import { UsageCard } from "@/components/usage/usage-card";
import {
  ModelPicker,
  findModel,
  type ModelSelection,
} from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { resolveAgainst } from "@/lib/folder-paths";
import { isAbsoluteProjectDirectory } from "@/lib/project-paths";

const suggestions = [
  {
    title: "Explore the codebase",
    prompt:
      "Give me a tour of this codebase. What does it do, how is it structured, and where should I start?",
  },
  {
    title: "Find and fix a bug",
    prompt:
      "Look for the most likely bug in the current uncommitted changes, explain it, and fix it.",
  },
  {
    title: "Write tests",
    prompt:
      "Identify the most important untested behavior in this project and write focused tests for it.",
  },
  {
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
  const [draft, setDraft] = React.useState("");

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
        let root = savedRoot?.trim() || "";
        const base = pathInfo?.directory?.trim();
        if (root && base && !isAbsoluteProjectDirectory(root)) {
          root = resolveAgainst(base, root);
          window.localStorage.setItem("oc.rootFolder", root);
        }
        setRootFolder(root);
      } catch {
        setRootFolder("");
      }
    });
  }, [models, pathInfo?.directory]);

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

  async function start(prompt?: string, options?: { send?: boolean }) {
    if (creating) return;
    setCreating(prompt ?? "blank");
    try {
      const session = await createSession({
        directory: rootFolder.trim() || undefined,
      });
      const query = prompt
        ? `?prompt=${encodeURIComponent(prompt)}${options?.send ? "&send=1" : ""}`
        : "";
      router.push(`/chat/${session.id}${query}`);
    } catch (error) {
      toast.error("Could not create a session", {
        description: error instanceof Error ? error.message : undefined,
      });
      setCreating(null);
    }
  }

  function submitDraft() {
    const text = draft.trim();
    if (text) void start(text, { send: true });
    else void start();
  }

  const recent = sessions.slice(0, 5);
  const workingFolder = rootFolder || pathInfo?.directory || "";
  const folderName = workingFolder.split(/[\\/]/).filter(Boolean).pop();
  const caption = health?.healthy
    ? `[ idle · ${harnessLabel} ${health.version} ]`
    : "[ offline ]";

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-12">
        <div className="animate-in-up">
          <AsciiEmblem />
          <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">{caption}</p>

          <h1 className="headline mt-10 text-[28px] leading-tight">
            {folderName ? `What should we build in ${folderName}?` : "What should we build?"}
          </h1>

          <div className="mt-4 flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 gap-1.5 px-1.5 text-[12px] text-muted-foreground"
              onClick={() => setFolderOpen(true)}
              disabled={Boolean(creating)}
              title={workingFolder || "Server default folder"}
              aria-label="Change working folder"
            >
              <FolderGit2 className="size-3.5 shrink-0" />
              <span className="truncate font-mono">{workingFolder || "server default"}</span>
            </Button>
            {rootFolder ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => changeRootFolder("")}
                disabled={Boolean(creating)}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <div className="relative mt-2 rounded-lg border border-input bg-card transition-colors focus-within:border-brand/50">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              rows={2}
              placeholder="Ask anything…  @ files · / commands · ! shell"
              disabled={Boolean(creating)}
              className="scrollbar-thin block max-h-[220px] min-h-[76px] w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground"
              aria-label="First message"
              autoFocus
            />
            <div className="absolute bottom-2.5 right-2.5">
              <Button
                size="icon-sm"
                onClick={submitDraft}
                disabled={Boolean(creating)}
                aria-label={draft.trim() ? "Start session and send" : "Start a blank session"}
              >
                {creating === "blank" || (creating && creating === draft.trim()) ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <ModelPicker
              models={models}
              value={selectedModel}
              onChange={handleModelChange}
              allowDefault
              side="bottom"
              label="Default model for new conversations"
            />
          </div>

          <ul className="mt-6 space-y-1">
            {suggestions.map((suggestion) => (
              <li key={suggestion.title}>
                <button
                  type="button"
                  disabled={Boolean(creating)}
                  onClick={() => void start(suggestion.prompt)}
                  className="inline-flex items-center gap-2 rounded-sm py-0.5 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  title={suggestion.prompt}
                >
                  {creating === suggestion.prompt ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                  ) : (
                    <ArrowRight className="size-3 shrink-0" />
                  )}
                  {suggestion.title}
                </button>
              </li>
            ))}
          </ul>

          {recent.length > 0 ? (
            <section className="mt-12" aria-labelledby="recent-sessions">
              <h2 id="recent-sessions" className="mb-1 text-[12px] text-muted-foreground">
                Recent sessions
              </h2>
              <div className="divide-y divide-border border-y border-border">
                {recent.map((session) => (
                  <Link
                    key={session.id}
                    href={`/chat/${session.id}`}
                    className="flex items-center gap-3 px-1 py-2 text-[13px] transition-colors hover:bg-secondary/60"
                  >
                    <span className="status-square bg-muted-foreground/50" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <span
                      className="font-mono text-[11px] text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {new Date(session.time.updated).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-10">
            <UsageCard />
          </div>
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
