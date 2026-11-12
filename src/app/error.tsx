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
      <div className="w-full max-w-md text-center">
        <CircleAlert className="mx-auto size-5 text-destructive" aria-hidden="true" />
        <h1 className="headline mt-4 text-[20px] leading-tight">Something broke in this view.</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          The OpenCode server may be unreachable. You can retry without losing the
          rest of the app.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
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
