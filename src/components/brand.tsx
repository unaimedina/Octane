import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-[10px] border border-border/70 bg-[#12171e] text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(255,138,0,0.06)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 28 28" fill="none" className="size-5">
        <path
          d="M14 2.6 23.4 8v12L14 25.4 4.6 20V8z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 10.2 13 14l-3.8 3.8M15.4 18h4.2"
          stroke="#f8fafc"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function Wordmark({
  className,
  showBadge = true,
}: {
  className?: string;
  showBadge?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[16px] font-semibold uppercase leading-none tracking-[0.04em]">
          <span className="text-brand">OC</span>
          <span className="text-foreground">TANE</span>
        </span>
        {showBadge ? (
          <span className="mt-1 font-mono text-[8px] uppercase leading-none tracking-[0.2em] text-muted-foreground/60">
            OpenCode client
          </span>
        ) : null}
      </span>
    </span>
  );
}
