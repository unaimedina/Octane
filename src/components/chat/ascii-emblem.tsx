import { cn } from "@/lib/utils";

/**
 * OCTANE identity mark for empty states: the project name as slanted ASCII
 * art. Static on purpose, so `prefers-reduced-motion` needs nothing.
 */

// figlet "slant". String.raw keeps the backslashes literal.
const ART = String.raw`
   ____  ______________    _   ________
  / __ \/ ____/_  __/   |  / | / / ____/
 / / / / /     / / / /| | /  |/ / __/
/ /_/ / /___  / / / ___ |/ /|  / /___
\____/\____/ /_/ /_/  |_/_/ |_/_____/
`.slice(1, -1);

export function AsciiEmblem({ className }: { className?: string }) {
  return (
    <pre
      role="img"
      aria-label="OCTANE"
      className={cn(
        "mx-auto w-fit select-none font-mono text-[10px] leading-[1.15] text-muted-foreground sm:text-sm sm:leading-[1.15]",
        className,
      )}
    >
      {ART}
    </pre>
  );
}
