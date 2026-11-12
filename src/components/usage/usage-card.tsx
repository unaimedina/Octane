"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { Button } from "@/components/ui/button";

function money(value: number): string {
  if (value <= 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

export function UsageCard() {
  const { usage } = useAppData();
  const monthlyPercent =
    usage.monthlyBudget && usage.monthlyBudget > 0
      ? (usage.totalCost / usage.monthlyBudget) * 100
      : null;

  return (
    <div className="surface-panel mb-5 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Usage · {usage.monthLabel}</div>
          {usage.hasUsage ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xl tabular-nums">
                  {monthlyPercent !== null
                    ? formatPercent(monthlyPercent)
                    : money(usage.totalCost)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {usage.totalSessions} session
                  {usage.totalSessions === 1 ? "" : "s"} ·{" "}
                  {formatTokens(usage.totalTokens)} tokens
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {usage.monthlyBudget
                  ? `${money(usage.totalCost)} of ${money(usage.monthlyBudget)} · on pace for ${formatPercent(usage.forecast.percent ?? 0)}`
                  : `${money(usage.forecast.cost)} projected by month end`}
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No usage recorded this month yet.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
          <Link href="/usage">
            View usage <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
      {usage.hasUsage && usage.monthlyBudget ? (
        <div className="mt-3 h-1 overflow-hidden bg-muted">
          <div
            className="h-full bg-brand transition-[width] duration-500"
            style={{
              width: `${Math.min(100, Math.max(1, monthlyPercent ?? 0))}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
