import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      <div className="glass-float relative w-full max-w-md rounded-2xl p-8 text-center">
        <BrandMark className="mx-auto size-11 rounded-xl" />
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          404 · not found
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          This page went missing.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The session may have been deleted, or the link is incorrect.
        </p>
        <Button asChild className="mt-6">
          <Link href="/chat">Back to sessions</Link>
        </Button>
      </div>
    </main>
  );
}
