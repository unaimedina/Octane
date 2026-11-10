"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MultiFileDiff, PatchDiff, type FileContents } from "@pierre/diffs/react";

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
    }),
    [themeType],
  );

  if (patch) {
    return (
      <PatchDiff
        patch={patch}
        options={options}
        className={className}
        disableWorkerPool
      />
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
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={options}
      className={className}
      disableWorkerPool
    />
  );
}
