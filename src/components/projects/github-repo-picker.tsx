"use client";

import * as React from "react";
import {
  Check,
  GitBranch,
  Loader2,
  Lock,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { ApiError, apiJson } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GithubRepo, GithubStatus } from "@/lib/types";

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export function GithubRepoPicker({
  github,
  value,
  onChange,
}: {
  github: GithubStatus;
  value?: { repo: string };
  onChange: (value?: { repo: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [repos, setRepos] = React.useState<GithubRepo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reconnect, setReconnect] = React.useState(false);
  const [manual, setManual] = React.useState("");

  async function loadRepos() {
    setLoading(true);
    setError(null);
    setReconnect(false);
    try {
      const data = await apiJson<{ repos: GithubRepo[] }>("/github/repos");
      setRepos(data.repos);
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (
          cause.code === "github_reconnect_required" ||
          cause.code === "github_not_connected"
        ) {
          setReconnect(true);
          setError(cause.message);
        } else {
          setError(cause.message);
        }
      } else {
        setError("Could not load repositories.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void loadRepos();
  }

  function choose(repo: string) {
    onChange({ repo });
    setOpen(false);
    setManual("");
  }

  const chip = value?.repo ? (
    <div className="flex items-center gap-2 rounded-[10px] border border-border/60 bg-card/30 px-2.5 py-2">
      <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
        {value.repo}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => onChange(undefined)}
        aria-label={`Remove ${value.repo}`}
      >
        <X className="size-3" />
      </Button>
    </div>
  ) : null;

  return (
    <div className="space-y-2">
      {!github.configured ? (
        <p className="rounded-[10px] border border-dashed border-border/60 bg-muted/15 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          GitHub is not configured on this deployment. Set{" "}
          <span className="font-mono">GITHUB_CLIENT_ID</span> and{" "}
          <span className="font-mono">GITHUB_CLIENT_SECRET</span> to link
          repositories. Projects still work without it.
        </p>
      ) : null}

      {github.configured && !github.connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <a href="/api/github/connect?next=/projects">
              <GitBranch className="size-3.5" /> Connect GitHub
            </a>
          </Button>
          {value?.repo ? (
            <span className="text-[11px] text-muted-foreground">
              Connect GitHub to change it.
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Optional: link a repository to this project.
            </span>
          )}
        </div>
      ) : null}

      {chip}

      {github.configured && github.connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <GitBranch className="size-3.5" />@{github.login ?? "github"}
          </span>
          <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Settings2 className="size-3.5" />
                {value?.repo ? "Change repository" : "Choose repository"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading repositories…
                </div>
              ) : reconnect ? (
                <div className="space-y-2 px-3 py-4 text-center text-xs">
                  <p className="text-destructive">{error}</p>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href="/api/github/connect?next=/projects">
                      <RefreshCw className="size-3.5" /> Reconnect GitHub
                    </a>
                  </Button>
                </div>
              ) : error ? (
                <div className="space-y-2 px-3 py-4 text-center text-xs">
                  <p className="text-destructive">{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadRepos()}
                  >
                    <RefreshCw className="size-3.5" /> Retry
                  </Button>
                </div>
              ) : (
                <>
                  <Command>
                    <CommandInput placeholder="Search repositories…" autoFocus />
                    <CommandList>
                      <CommandEmpty>No repositories found.</CommandEmpty>
                      <CommandGroup heading="Repositories">
                        {repos.map((repo) => (
                          <CommandItem
                            key={repo.fullName}
                            value={repo.fullName}
                            onSelect={() => choose(repo.fullName)}
                          >
                            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-[11px]">
                                {repo.fullName}
                              </span>
                              {repo.description ? (
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {repo.description}
                                </span>
                              ) : null}
                            </span>
                            {repo.private ? (
                              <Badge variant="outline" className="gap-1 font-mono text-[9px]">
                                <Lock className="size-2.5" /> private
                              </Badge>
                            ) : null}
                            {value?.repo === repo.fullName ? (
                              <Check className="size-3.5 text-success" />
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  <div className="space-y-2 border-t border-border/60 p-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                      Link another repository
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={manual}
                        onChange={(event) => setManual(event.target.value)}
                        placeholder="owner/repository"
                        className="h-8 font-mono text-xs"
                        spellCheck={false}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (REPO_PATTERN.test(manual.trim())) choose(manual.trim());
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!REPO_PATTERN.test(manual.trim())}
                        onClick={() => choose(manual.trim())}
                      >
                        Use
                      </Button>
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Repositories beyond the first 100 can be linked by name; the
                      server verifies access before saving.
                    </p>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}
