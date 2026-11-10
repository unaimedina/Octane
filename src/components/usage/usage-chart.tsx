"use client";

import * as React from "react";
import type { UsageDay } from "@/lib/usage";
import { cn } from "@/lib/utils";

function axisMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(1)}`;
}

export function UsageChart({
  days,
  budget,
  forecastCost,
  compact = false,
  className,
}: {
  days: UsageDay[];
  budget?: number | null;
  forecastCost?: number;
  compact?: boolean;
  className?: string;
}) {
  const id = React.useId().replace(/:/g, "");
  const width = 720;
  const height = compact ? 64 : 230;
  const padX = compact ? 2 : 10;
  const padTop = compact ? 6 : 18;
  const padBottom = compact ? 6 : 28;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padTop - padBottom;

  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.future) === -1
      ? days.length - 1
      : days.findIndex((day) => day.future) - 1,
  );
  const actual = days.slice(0, todayIndex + 1);
  const lastActual = actual.at(-1);
  const maxValue = Math.max(
    budget ? budget * 1.2 : 0,
    lastActual?.cumulativeCost ?? 0,
    forecastCost ?? 0,
    1,
  );
  const x = (index: number) =>
    padX + (days.length <= 1 ? 0 : (index / (days.length - 1)) * plotWidth);
  const y = (value: number) =>
    padTop + plotHeight - Math.max(0, Math.min(1, value / maxValue)) * plotHeight;

  const actualPoints = actual.map((day, index) => ({
    x: x(index),
    y: y(day.cumulativeCost),
  }));
  const line = actualPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const area = actualPoints.length
    ? `${line} L${actualPoints.at(-1)!.x},${padTop + plotHeight} L${actualPoints[0].x},${padTop + plotHeight} Z`
    : "";
  const forecastStart = actualPoints.at(-1);
  const forecastEnd = forecastStart
    ? {
        x: x(days.length - 1),
        y: y(forecastCost ?? lastActual?.cumulativeCost ?? 0),
      }
    : null;

  const gridLines = [0, 0.33, 0.66, 1];
  const labelIndices = compact
    ? []
    : [0, Math.floor((days.length - 1) / 2), Math.max(0, days.length - 1)];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", compact ? "h-14" : "h-auto", className)}
      role="img"
      aria-label="Usage over the current month"
    >
      <defs>
        <linearGradient id={`usage-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {!compact
        ? gridLines.map((fraction) => {
            const value = maxValue * fraction;
            const lineY = y(value);
            return (
              <g key={fraction}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={lineY}
                  y2={lineY}
                  stroke="var(--border)"
                  strokeDasharray={fraction === 1 ? "4 4" : undefined}
                  strokeOpacity="0.55"
                />
                <text
                  x={padX}
                  y={lineY - 4}
                  fill="var(--muted-foreground)"
                  fontSize="9"
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                >
                  {axisMoney(value)}
                </text>
              </g>
            );
          })
        : null}

      {budget && !compact ? (
        <line
          x1={padX}
          x2={width - padX}
          y1={y(budget)}
          y2={y(budget)}
          stroke="var(--warning)"
          strokeDasharray="4 4"
          strokeOpacity="0.55"
        />
      ) : null}

      {!compact && todayIndex > 0 && todayIndex < days.length - 1 ? (
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

      {area ? <path d={area} fill={`url(#usage-${id})`} /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={compact ? 1.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {forecastStart && forecastEnd && !compact ? (
        <line
          x1={forecastStart.x}
          y1={forecastStart.y}
          x2={forecastEnd.x}
          y2={forecastEnd.y}
          stroke="var(--info)"
          strokeDasharray="5 5"
          strokeOpacity="0.75"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {forecastStart ? (
        <circle
          cx={forecastStart.x}
          cy={forecastStart.y}
          r={compact ? 2 : 3}
          fill="var(--info)"
          stroke="var(--background)"
          strokeWidth="2"
        />
      ) : null}

      {!compact
        ? labelIndices.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 8}
              textAnchor={
                index === 0 ? "start" : index === days.length - 1 ? "end" : "middle"
              }
              fill="var(--muted-foreground)"
              fontSize="9"
              fontFamily="var(--font-mono), ui-monospace, monospace"
            >
              {days[index]?.label ?? ""}
            </text>
          ))
        : null}
    </svg>
  );
}
