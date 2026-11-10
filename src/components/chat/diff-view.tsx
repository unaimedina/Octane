"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { diffLines } from "diff";
import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PierreDiff = dynamic(
  () => import("@/components/chat/pierre-diff").then((mod) => mod.PierreDiff),
  {
    ssr: false,
    loading: () => (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Loading diff…
      </div>
    ),
  },
);

type DiffLine = {
  type: "add" | "del" | "ctx";
  text: string;
  oldLine?: number;
  newLine?: number;
};

function buildLines(before: string, after: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNumber = 1;
  let newNumber = 1;
  for (const change of diffLines(before, after)) {
    const raw = change.value.split("\n");
    if (raw.at(-1) === "") raw.pop();
    for (const text of raw) {
      if (change.added) {
        lines.push({ type: "add", text, newLine: newNumber++ });
      } else if (change.removed) {
        lines.push({ type: "del", text, oldLine: oldNumber++ });
      } else {
        lines.push({
          type: "ctx",
          text,
          oldLine: oldNumber++,
          newLine: newNumber++,
        });
      }
    }
  }
  return lines;
}

function parseUnified(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (match) {
        oldNumber = Number(match[1]);
        newNumber = Number(match[2]);
      }
      lines.push({ type: "ctx", text: raw });
    } else if (
      raw.startsWith("+++") ||
      raw.startsWith("---") ||
      raw.startsWith("diff ") ||
      raw.startsWith("index ")
    ) {
      lines.push({ type: "ctx", text: raw });
    } else if (raw.startsWith("+")) {
      lines.push({ type: "add", text: raw.slice(1), newLine: newNumber++ });
    } else if (raw.startsWith("-")) {
      lines.push({ type: "del", text: raw.slice(1), oldLine: oldNumber++ });
    } else if (raw.length > 0) {
      lines.push({
        type: "ctx",
        text: raw.startsWith(" ") ? raw.slice(1) : raw,
        oldLine: oldNumber || undefined,
        newLine: newNumber || undefined,
      });
      if (oldNumber) oldNumber += 1;
      if (newNumber) newNumber += 1;
    }
  }
  return lines;
}

export const DiffView = React.memo(function DiffView({
  before,
  after,
  diff,
  file,
  additions,
  deletions,
  className,
  collapsible = false,
  hideHeader = false,
}: {
  before?: string;
  after?: string;
  diff?: string;
  file?: string;
  additions?: number;
  deletions?: number;
  className?: string;
  collapsible?: boolean;
  hideHeader?: boolean;
}) {
  const lines = React.useMemo(() => {
    if (typeof before === "string" && typeof after === "string") {
      return buildLines(before, after);
    }
    if (diff) return parseUnified(diff);
    return [];
  }, [before, after, diff]);

  const added = additions ?? lines.filter((line) => line.type === "add").length;
  const removed = deletions ?? lines.filter((line) => line.type === "del").length;

  const body = (
    <div className="bg-background/30">
      {lines.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">No changes.</div>
      ) : (
        <PierreDiff
          before={before}
          after={after}
          patch={diff}
          file={file}
        />
      )}
    </div>
  );

  const header = hideHeader ? null : (
    <div className="flex min-w-0 items-center gap-2 border-b border-border/60 px-3 py-2">
      <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file ?? "diff"}</span>
      <span className="shrink-0 font-mono text-[10px] text-success">
        +{added}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-destructive">
        -{removed}
      </span>
    </div>
  );

  if (collapsible) {
    return (
      <details className={cn("overflow-hidden rounded-[10px] border border-border/60", className)}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {header}
        </summary>
        {body}
      </details>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-[10px] border border-border/60", className)}>
      {header}
      {body}
    </div>
  );
});
