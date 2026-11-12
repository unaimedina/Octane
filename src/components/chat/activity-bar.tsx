import type * as React from "react";
import { cn } from "@/lib/utils";

const SEGMENTS = 16;
/** Segments that stay orange when motion is reduced (the sweep window). */
const LIT_WINDOW = 6;

/**
 * "The agent is doing something" indicator: slanted segments (the logo's 12°)
 * with an orange window sweeping left to right. Pure CSS (`activity-sweep` in
 * globals.css); with reduced motion the last segments are statically lit.
 */
export function ActivityBar({ active, label }: { active: boolean; label?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={cn(
              "activity-seg h-1.5 w-3 -skew-x-12 rounded-[1px] bg-muted-foreground/25",
              active && "activity-seg-active",
            )}
            data-lit={active && index >= SEGMENTS - LIT_WINDOW ? "" : undefined}
            style={{ "--i": index } as React.CSSProperties}
          />
        ))}
      </div>
      {label ? (
        <span role="status" aria-live="polite" className="min-w-0 truncate text-xs text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}
