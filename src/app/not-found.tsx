import Link from "next/link";
import { DotMatrixEmblem } from "@/components/chat/dot-matrix-emblem";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md text-center">
        <DotMatrixEmblem lit={false} className="mx-auto w-[240px]" />
        <p className="mt-6 font-mono text-[11px] text-muted-foreground">404 · Not found</p>
        <h1 className="headline mt-2 text-[24px] leading-tight">This page went missing.</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          The session may have been deleted, or the link is incorrect.
        </p>
        <Button asChild className="mt-6">
          <Link href="/chat">Back to sessions</Link>
        </Button>
      </div>
    </main>
  );
}
