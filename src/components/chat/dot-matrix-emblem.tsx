import { cn } from "@/lib/utils";

/**
 * OCTANE identity mark for empty states (and /login in plan 018): a faint dot
 * grid with three speed streaks rising at the logo's ~12° slant into a blocky,
 * slanted "OC". Static on purpose, so `prefers-reduced-motion` needs nothing.
 */

const COLS = 64;
const ROWS = 14;
const CELL = 6;
const STEP = 8; // cell + 2-unit gap
const WIDTH = COLS * STEP - 2;
const HEIGHT = ROWS * STEP - 2;

type Cell = { x: number; y: number; opacity: number; lit?: boolean };

/** A run of cells rising one row every 5 columns; tail faint, head strong. */
function streak(startX: number, startRow: number, length: number): Cell[] {
  return Array.from({ length }, (_, index) => ({
    x: startX + index,
    y: startRow - Math.floor(index / 5),
    opacity: 0.25 + (0.45 * index) / (length - 1),
    lit: index >= length - 2,
  }));
}

// Rows 4 apart and rising 1 row per 5 columns, so the streaks stay parallel.
// Lengths avoid 1 mod 5 so both lit head cells sit on the same row.
const STREAKS: Cell[] = [
  ...streak(6, 13, 22),
  ...streak(3, 9, 25),
  ...streak(10, 5, 20),
];

// 7×7 bitmaps with 2-cell strokes, top row first.
const GLYPH_O = [".#####.", "##...##", "##...##", "##...##", "##...##", "##...##", ".#####."];
const GLYPH_C = [".######", "##.....", "##.....", "##.....", "##.....", "##.....", ".######"];

/** Shift upper rows right (one column per two rows) to fake the 12° italic. */
function glyph(bitmap: string[], left: number, top: number): Cell[] {
  const cells: Cell[] = [];
  const bottom = bitmap.length - 1;
  bitmap.forEach((row, rowIndex) => {
    const shift = Math.floor((bottom - rowIndex) / 2);
    [...row].forEach((char, col) => {
      if (char === "#") cells.push({ x: left + col + shift, y: top + rowIndex, opacity: 0.55 });
    });
  });
  return cells;
}

const MONOGRAM: Cell[] = [...glyph(GLYPH_O, 40, 3), ...glyph(GLYPH_C, 50, 3)];

export function DotMatrixEmblem({ className, lit = true }: { className?: string; lit?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("h-auto w-full max-w-[640px]", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id="octane-dot-grid" width={STEP} height={STEP} patternUnits="userSpaceOnUse">
          <rect width={CELL} height={CELL} rx={1} className="fill-muted-foreground" opacity={0.12} />
        </pattern>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#octane-dot-grid)" />
      <g>
        {[...STREAKS, ...MONOGRAM].map((cell) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x * STEP}
            y={cell.y * STEP}
            width={CELL}
            height={CELL}
            rx={1}
            className={lit && cell.lit ? "fill-brand" : "fill-muted-foreground"}
            opacity={lit && cell.lit ? 1 : cell.opacity}
          />
        ))}
      </g>
    </svg>
  );
}
