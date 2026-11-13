"use client";

import type { UsageDay } from "@/lib/usage";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function UsageChart({
  days,
  unit,
  forecast,
  className,
}: {
  days: UsageDay[];
  unit: "percent" | "tokens";
  forecast?: { eta: number | null; projectedAtReset: number | null } | null;
  className?: string;
}) {
  const width = 720;
  const height = 240;
  const padX = 10;
  const padTop = 18;
  const padBottom = 28;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padTop - padBottom;
  const label = unit === "percent" ? "Usage this period" : "Token usage this period";

  if (days.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("w-full", className)}
        role="img"
        aria-label={label}
      />
    );
  }

  const percentMode = unit === "percent";
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.future) === -1
      ? days.length - 1
      : days.findIndex((day) => day.future) - 1,
  );
  const actual = days.slice(0, todayIndex + 1);

  const maxTokens = Math.max(0, ...days.map((day) => day.cumulativeTokens));
  const axisMax = percentMode ? 150 : Math.max(1, maxTokens) * 1.1;
  const gridValues = percentMode
    ? [0, 50, 100, 150]
    : [0, axisMax * 0.33, axisMax * 0.66, axisMax];

  const x = (index: number) =>
    padX + (days.length <= 1 ? 0 : (index / (days.length - 1)) * plotWidth);
  const y = (value: number) =>
    padTop + plotHeight - Math.max(0, Math.min(1, value / axisMax)) * plotHeight;
  const xForTime = (ts: number) =>
    Math.max(
      padX,
      Math.min(
        width - padX,
        padX + ((ts - days[0].date) / DAY / Math.max(1, days.length - 1)) * plotWidth,
      ),
    );

  const value = (day: UsageDay) =>
    percentMode ? day.percent : day.cumulativeTokens;
  const actualPoints = actual.map((day, index) => ({
    x: x(index),
    y: y(value(day)),
  }));
  const line = actualPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const lastPoint = actualPoints.at(-1);
  const forecastEnd =
    percentMode && forecast && lastPoint
      ? forecast.eta !== null && forecast.eta <= (days.at(-1)?.date ?? 0)
        ? { x: xForTime(forecast.eta), y: y(100) }
        : {
            x: x(days.length - 1),
            y: y(Math.max(0, Math.min(150, forecast.projectedAtReset ?? 0))),
          }
      : null;

  const labelIndices = [
    ...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]),
  ];
  const lastIndex = days.length - 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      role="img"
      aria-label={label}
    >
      {gridValues.map((gridValue) => {
        const lineY = y(gridValue);
        return (
          <g key={gridValue}>
            <line
              x1={padX}
              x2={width - padX}
              y1={lineY}
              y2={lineY}
              stroke="var(--border)"
            />
            <text
              x={padX}
              y={lineY - 4}
              fill="var(--muted-foreground)"
              fontSize="9"
              fontFamily="var(--font-mono), ui-monospace, monospace"
            >
              {percentMode ? `${Math.round(gridValue)}%` : formatTokens(gridValue)}
            </text>
          </g>
        );
      })}

      {percentMode ? (
        <>
          <line
            x1={padX}
            x2={width - padX}
            y1={y(100)}
            y2={y(100)}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
          />
          <text
            x={width - padX}
            y={y(100) - 4}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="9"
            fontFamily="var(--font-mono), ui-monospace, monospace"
          >
            100%
          </text>
        </>
      ) : null}

      {todayIndex > 0 && todayIndex < lastIndex ? (
        <g>
          <line
            x1={x(todayIndex)}
            x2={x(todayIndex)}
            y1={padTop}
            y2={padTop + plotHeight}
            stroke="var(--muted-foreground)"
            strokeOpacity="0.28"
            strokeDasharray="2 4"
          />
          <text
            x={x(todayIndex)}
            y={padTop - 6}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="9"
            fontFamily="var(--font-mono), ui-monospace, monospace"
          >
            today
          </text>
        </g>
      ) : null}

      {line ? (
        <path
          d={line}
          fill="none"
          stroke={percentMode ? "var(--success)" : "var(--brand)"}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {forecastEnd && lastPoint ? (
        <line
          x1={lastPoint.x}
          y1={lastPoint.y}
          x2={forecastEnd.x}
          y2={forecastEnd.y}
          stroke="var(--warning)"
          strokeDasharray="5 5"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {lastPoint ? (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={3}
          fill={percentMode ? "var(--success)" : "var(--brand)"}
          stroke="var(--background)"
          strokeWidth={2}
        />
      ) : null}

      {labelIndices.map((index) => (
        <text
          key={index}
          x={x(index)}
          y={height - 8}
          textAnchor={index === 0 ? "start" : index === lastIndex ? "end" : "middle"}
          fill={
            percentMode && index === lastIndex
              ? "var(--warning)"
              : "var(--muted-foreground)"
          }
          fontSize="9"
          fontFamily="var(--font-mono), ui-monospace, monospace"
        >
          {days[index]?.label ?? ""}
        </text>
      ))}
    </svg>
  );
}
