import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/icon-192.png"
      alt=""
      aria-hidden="true"
      width={192}
      height={192}
      draggable={false}
      className={cn(
        "size-9 shrink-0 select-none rounded-[10px] object-cover",
        className,
      )}
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
