"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiJson, jsonBody } from "@/lib/api";

type DetectedSkill = {
  id: string;
  name: string;
  description?: string;
  path: string;
};

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function SkillInstaller() {
  const router = useRouter();
  const [repo, setRepo] = React.useState("");
  const [ref, setRef] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [detected, setDetected] = React.useState<DetectedSkill[] | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [destination, setDestination] = React.useState<string | null>(null);

  function resetScan() {
    setDetected(null);
    setSelected([]);
  }

  async function scan() {
    const value = repo.trim();
    if (!value || scanning) return;
    setScanning(true);
    resetScan();
    try {
      const result = await apiJson<{
        skills: DetectedSkill[];
        destination?: string | null;
      }>("/skills/install", {
        method: "POST",
        ...jsonBody({
          action: "scan",
          repo: value,
          ref: ref.trim() || undefined,
        }),
      });
      setDetected(result.skills);
      setSelected(result.skills.map((skill) => skill.path));
      setDestination(result.destination ?? null);
      if (result.skills.length === 0) {
        toast.info("No SKILL.md folders found in that repository");
      }
    } catch (error) {
      toast.error("Could not scan repository", {
        description: errorMessage(error),
      });
    } finally {
      setScanning(false);
    }
  }

  async function install() {
    if (!detected || selected.length === 0 || installing) return;
    setInstalling(true);
    try {
      const result = await apiJson<{
        installed: DetectedSkill[];
        destination?: string | null;
      }>(
        "/skills/install",
        {
          method: "POST",
          ...jsonBody({
            action: "install",
            repo: repo.trim(),
            ref: ref.trim() || undefined,
            skills: selected,
          }),
        },
      );
      if (result.destination) setDestination(result.destination);
      if (result.installed.length === 0) {
        toast.error("No skills were installed");
        return;
      }
      toast.success(
        `Installed ${result.installed.length} skill${
          result.installed.length === 1 ? "" : "s"
        }`,
        { description: result.installed.map((skill) => skill.id).join(", ") },
      );
      router.refresh();
    } catch (error) {
      toast.error("Could not install skills", {
        description: errorMessage(error),
      });
    } finally {
      setInstalling(false);
    }
  }

  function toggle(path: string) {
    setSelected((current) =>
      current.includes(path)
        ? current.filter((value) => value !== path)
        : [...current, path],
    );
  }

  const allSelected =
    detected !== null && detected.length > 0 && selected.length === detected.length;

  return (
    // Rendered inside the Settings "Skills" section, which owns the heading.
    <div className="space-y-3">
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void scan();
          }}
        >
          <Input
            value={repo}
            onChange={(event) => {
              setRepo(event.target.value);
              resetScan();
            }}
            placeholder="https://github.com/user/skills"
            type="url"
            spellCheck={false}
            disabled={scanning || installing}
            aria-label="Repository URL"
          />
          <Input
            value={ref}
            onChange={(event) => {
              setRef(event.target.value);
              resetScan();
            }}
            placeholder="branch or tag"
            spellCheck={false}
            disabled={scanning || installing}
            aria-label="Branch or tag"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={!repo.trim() || scanning || installing}
          >
            {scanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Scan
          </Button>
        </form>

        {scanning ? (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Cloning and looking for skills…
          </p>
        ) : null}

        {detected !== null && detected.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium">
                {detected.length} skill{detected.length === 1 ? "" : "s"} found
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    allSelected ? [] : detected.map((skill) => skill.path),
                  )
                }
                className="font-mono text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <Button
                size="sm"
                className="ml-auto h-8"
                onClick={() => void install()}
                disabled={selected.length === 0 || installing}
              >
                {installing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <PackagePlus className="size-3.5" />
                )}
                Install {selected.length > 0 ? `(${selected.length})` : ""}
              </Button>
            </div>
            <ul className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {detected.map((skill) => {
                const checked = selected.includes(skill.path);
                return (
                  <li key={`${skill.id}:${skill.path}`}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(skill.path)}
                        className="mt-0.5 size-3.5 rounded-sm accent-brand"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-xs font-medium">
                            {skill.name}
                          </span>
                          <span className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                            {skill.id}
                          </span>
                          {checked ? (
                            <Check className="size-3 text-success" />
                          ) : null}
                        </span>
                        {skill.description ? (
                          <span className="mt-0.5 block max-h-8 overflow-hidden text-[11px] leading-relaxed text-muted-foreground">
                            {skill.description}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                          {skill.path === "." ? "repository root" : skill.path}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {detected !== null && detected.length === 0 ? (
          <p className="rounded-sm border-l-2 border-warning bg-warning/8 px-3 py-2 text-xs text-warning">
            No <span className="font-mono">SKILL.md</span> folders were found. Point
            the scanner at the repository that contains the skill folder, or use the
            branch/tag field.
          </p>
        ) : null}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {destination ? (
            <>
              Installs into{" "}
              <span className="font-mono">{destination}</span>.{" "}
            </>
          ) : (
            <>
              Installs into the shared skills directory, or{" "}
              <span className="font-mono">.opencode/skills</span> in the workspace
              when no shared directory is configured.{" "}
            </>
          )}
          Existing skills with the same ID are replaced. Public repositories only.
        </p>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          If installation fails with <span className="font-mono">EACCES</span>, make
          sure the shared skills volume is mounted and writable by UID 1001. In Docker
          Compose this is the <span className="font-mono">opencode-skills</span>{" "}
          volume.
        </p>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Installed skills appear in the composer after the page refreshes.
        </p>
    </div>
  );
}
