"use client";

import * as React from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-5 py-16">
      <div className="glass-panel w-full max-w-md rounded-2xl p-7 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive">
          <CircleAlert className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Something broke in this view.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The OpenCode server may be unreachable. You can retry without losing the
          rest of the app.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[10px] text-muted-foreground/60">
            digest {error.digest}
          </p>
        ) : null}
        <Button onClick={reset} className="mt-5 gap-2">
          <RotateCcw className="size-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
