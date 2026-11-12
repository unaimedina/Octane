import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card",
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
}: {
  className?: string;
  /** @deprecated No longer rendered; removed in plan 018. */
  showBadge?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col">
        <span className="headline truncate text-[18px] uppercase leading-none">
          <span className="text-brand">OC</span>
          <span className="text-foreground">TANE</span>
        </span>
      </span>
    </span>
  );
}
