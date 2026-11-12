"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MultiFileDiff, PatchDiff, type FileContents } from "@pierre/diffs/react";
import { cn } from "@/lib/utils";

/**
 * The syntax theme sets --diffs-{dark,light}-bg on :host inside
 * `@layer rendered`, so values inherited from .octane-diff lose. An unlayered
 * :host rule wins; var(--card) still resolves because custom properties
 * inherit into the shadow root.
 */
const SURFACE_CSS = ":host { --diffs-dark-bg: var(--card); --diffs-light-bg: var(--card); }";

export function PierreDiff({
  before,
  after,
  patch,
  file,
  className,
}: {
  before?: string;
  after?: string;
  patch?: string;
  file?: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const themeType: "light" | "dark" =
    resolvedTheme === "light" ? "light" : "dark";
  const options = React.useMemo(
    () => ({
      themeType,
      diffStyle: "unified" as const,
      overflow: "wrap" as const,
      disableFileHeader: true,
      diffIndicators: "classic" as const,
      hunkSeparators: "line-info-basic" as const,
      expandUnchanged: false,
      // Keep the add/remove backgrounds; their colors come from .octane-diff.
      disableBackground: false,
      unsafeCSS: SURFACE_CSS,
    }),
    [themeType],
  );

  if (patch) {
    return (
      <div className={cn("octane-diff", className)}>
        <PatchDiff patch={patch} options={options} disableWorkerPool />
      </div>
    );
  }

  if (typeof before !== "string" || typeof after !== "string") {
    return null;
  }

  const oldFile: FileContents = {
    name: file ?? "before",
    contents: before,
  };
  const newFile: FileContents = {
    name: file ?? "after",
    contents: after,
  };

  return (
    <div className={cn("octane-diff", className)}>
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={options}
        disableWorkerPool
      />
    </div>
  );
}
