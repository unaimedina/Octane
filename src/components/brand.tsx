import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-[10px] border border-border/70 bg-[#12171e] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(255,138,0,0.06)]",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src="/brand/minimal.png"
        alt=""
        width={512}
        height={165}
        draggable={false}
        className="h-auto w-[78%] object-contain"
      />
    </div>
  );
}

/** Full OCTANE wordmark for dark surfaces (the white lettering needs a dark background). */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="OCTANE"
      width={1200}
      height={147}
      draggable={false}
      className={cn("h-6 w-auto", className)}
    />
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
