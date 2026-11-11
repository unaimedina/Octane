"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export type PlanFilePreviewItem = {
  ref: string;
  number: string;
  title: string;
  priority?: "P1" | "P2" | "P3";
  dependsOn: string[];
  status: string;
  imported: boolean;
};

export function PlanFilesImportDialog({
  open,
  onOpenChange,
  dir,
  items,
  warnings,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dir: string;
  items: PlanFilePreviewItem[];
  warnings: string[];
  onImport: (refs: string[]) => Promise<void>;
}) {
  const [unchecked, setUnchecked] = React.useState<Set<string>>(new Set());
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (importing) return;
    if (!next) {
      setUnchecked(new Set());
      setError(null);
    }
    onOpenChange(next);
  }

  const selectable = items.filter((item) => !item.imported);
  const selected = selectable.filter((item) => !unchecked.has(item.ref));

  function toggle(ref: string) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  async function submit() {
    if (importing || selected.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      await onImport(selected.map((item) => item.ref));
      handleOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import plan files</DialogTitle>
          <DialogDescription>
            Each plan in <code className="font-mono">{dir}/</code> becomes a task
            that tells the agent to execute that file.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-hidden rounded-md border border-border/60">
          <ScrollArea className="max-h-[50vh]">
            <ul className="divide-y divide-border/50">
              {items.map((item) => (
                <li key={item.ref}>
                  <label
                    className={
                      "flex items-start gap-2.5 px-3 py-2 text-sm " +
                      (item.imported ? "opacity-50" : "cursor-pointer")
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-3.5 shrink-0"
                      disabled={item.imported}
                      checked={!item.imported && !unchecked.has(item.ref)}
                      onChange={() => toggle(item.ref)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.number}
                        </span>{" "}
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        {item.priority ? <span>{item.priority}</span> : null}
                        <span>{item.imported ? "already imported" : item.status.toLowerCase()}</span>
                        {item.dependsOn.length > 0 ? (
                          <span>after {item.dependsOn.join(", ")}</span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        {warnings.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-warning">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={importing || selected.length === 0}>
            {importing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Import {selected.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
