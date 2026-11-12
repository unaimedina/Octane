"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import type { Project } from "@/lib/types";

const MAX_AGENTS_CHARS = 200_000;

type AgentsState = { content: string; etag: string; exists: boolean };

export function ProjectAgentsCard({
  project,
  reloadKey,
  onProjectChange,
}: {
  project: Project;
  reloadKey: number;
  onProjectChange: (project: Project) => void;
}) {
  const [state, setState] = React.useState<AgentsState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState<AgentsState | null>(null);
  const [migrating, setMigrating] = React.useState(false);

  const editingRef = React.useRef(editing);
  React.useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiJson<AgentsState>(`/projects/${project.id}/agents`);
      setUnavailable(null);
      setState(data);
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.code === "project_files_unavailable") {
        setUnavailable(error.message);
      } else {
        setLoadError(error instanceof Error ? error.message : "Could not load AGENTS.md.");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  React.useEffect(() => {
    // Skip background reloads while the user is typing; saving handles conflicts.
    if (editingRef.current) return;
    void load();
  }, [load, reloadKey]);

  function startEdit() {
    setDraft(state?.content ?? "");
    setConflict(null);
    setEditing(true);
  }

  async function save(etag: string) {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await apiJson<AgentsState>(`/projects/${project.id}/agents`, {
        method: "PUT",
        ...jsonBody({ content: draft, ifMatch: etag }),
      });
      setState(saved);
      setConflict(null);
      setEditing(false);
      toast.success("AGENTS.md saved");
    } catch (error) {
      if (error instanceof ApiError && error.code === "conflict") {
        try {
          const current = await apiJson<AgentsState>(`/projects/${project.id}/agents`);
          setConflict(current);
        } catch {
          toast.error("AGENTS.md changed on disk. Reload to continue.");
        }
      } else {
        toast.error("Could not save AGENTS.md", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function reloadDiscardingEdits() {
    const data = await load();
    if (data) {
      setEditing(false);
      setConflict(null);
    }
  }

  async function migrate() {
    if (migrating) return;
    setMigrating(true);
    try {
      const result = await apiJson<{ agents: AgentsState; project: Project }>(
        `/projects/${project.id}/agents/migrate`,
        { method: "POST" },
      );
      setState(result.agents);
      onProjectChange(result.project);
      toast.success("Moved into AGENTS.md");
    } catch (error) {
      toast.error("Could not move the legacy context", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setMigrating(false);
    }
  }

  return (
    <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-medium">AGENTS.md</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Instructions OpenCode loads for every session in this folder.
          </p>
        </div>
          {!editing && state && !unavailable ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Edit AGENTS.md"
              onClick={startEdit}
            >
              <Pencil className="size-3" />
            </Button>
          ) : null}
      </div>
      <div className="space-y-3">
        {project.context.trim() && !unavailable ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border-l-2 border-warning bg-warning/8 px-3 py-2">
            <p className="text-[11px] leading-relaxed">
              This project still has legacy global context.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void migrate()}
              disabled={migrating}
              className="gap-1.5"
            >
              {migrating ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Move into AGENTS.md
            </Button>
          </div>
        ) : null}

        {unavailable ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {unavailable}
          </p>
        ) : loadError ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border-l-2 border-destructive bg-destructive/8 px-3 py-2 text-xs text-destructive">
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : loading && !state ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading
          </div>
        ) : editing ? (
          <div className="space-y-2">
            {conflict ? (
              <div className="space-y-2 rounded-sm border-l-2 border-warning bg-warning/8 px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium">
                  <AlertTriangle className="size-3.5 text-warning" /> AGENTS.md changed on disk
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  The agent or git edited the file after you opened it. Reload to
                  discard your edits, or overwrite the file with your version.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void reloadDiscardingEdits()}
                  >
                    Reload
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={saving}
                    onClick={() => void save(conflict.etag)}
                  >
                    Overwrite
                  </Button>
                </div>
              </div>
            ) : null}
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[20rem] font-mono text-xs"
              maxLength={MAX_AGENTS_CHARS}
              aria-label="AGENTS.md content"
              spellCheck={false}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {draft.length.toLocaleString("en-US")} /{" "}
                {MAX_AGENTS_CHARS.toLocaleString("en-US")}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setConflict(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={saving || draft.length > MAX_AGENTS_CHARS || !state}
                  onClick={() => state && void save(state.etag)}
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : state?.exists && state.content.trim() ? (
          <div className="scrollbar-thin max-h-96 overflow-auto rounded-md border border-border bg-muted p-3 text-xs">
            <Markdown text={state.content} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs italic text-muted-foreground">
              No AGENTS.md in this folder yet. Add one so every session starts
              with your project instructions.
            </p>
            <Button size="sm" variant="outline" onClick={startEdit} disabled={!state}>
              Create AGENTS.md
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
