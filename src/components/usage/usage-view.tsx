"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ExternalLink,
  Gauge,
  RefreshCw,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useAppData } from "@/components/app-data";
import { UsageChart } from "@/components/usage/usage-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UsageLimit } from "@/lib/usage";
import { cn } from "@/lib/utils";

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

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

function limitTone(percent: number | null): string {
  if (percent === null) return "bg-muted-foreground/30";
  if (percent >= 100) return "bg-destructive";
  if (percent >= 75) return "bg-warning";
  return "bg-brand";
}

function LimitRow({ limit }: { limit: UsageLimit }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-medium">{limit.label}</span>
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {limit.hint}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {limit.budget
            ? `${formatPercent(limit.percent)} used`
            : money(limit.used)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", limitTone(limit.percent))}
          style={{
            width: `${Math.min(100, Math.max(1, limit.percent ?? (limit.used > 0 ? 2 : 0)))}%`,
          }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground/50">
        <span>{money(limit.used)}</span>
        <span>{limit.budget ? money(limit.budget) : "no budget set"}</span>
      </div>
    </div>
  );
}

export function UsageView() {
  const router = useRouter();
  const { usage } = useAppData();
  const [refreshing, setRefreshing] = React.useState(false);

  const monthlyPercent =
    usage.monthlyBudget && usage.monthlyBudget > 0
      ? (usage.totalCost / usage.monthlyBudget) * 100
      : null;

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Activity className="size-5 text-brand" /> Usage
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Estimated from sessions in this web client · {usage.monthLabel}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {!usage.hasUsage ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <Gauge className="size-7 text-muted-foreground/40" />
              <p className="text-sm font-medium">No usage recorded this month</p>
              <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                Start a session and the local usage estimate will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="glass-panel mb-4 rounded-xl p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-3xl font-semibold tracking-tight">
                    {monthlyPercent !== null
                      ? formatPercent(monthlyPercent)
                      : money(usage.totalCost)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {usage.monthLabel} · {usage.totalSessions} session
                    {usage.totalSessions === 1 ? "" : "s"} ·{" "}
                    {formatTokens(usage.totalTokens)} tokens
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {usage.monthlyBudget
                      ? `On pace for ${formatPercent(usage.forecast.percent)} · ${money(usage.forecast.cost)} projected`
                      : `${money(usage.forecast.cost)} projected by the end of the month`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full bg-brand" /> Usage
                  </span>
                  {usage.monthlyBudget ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="h-0.5 w-4 rounded-full border-t border-dashed border-info" />
                        Forecast
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-warning/70" />
                        Monthly limit
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <UsageChart
                days={usage.days}
                budget={usage.monthlyBudget}
                forecastCost={usage.forecast.cost}
                className="mt-3"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Gauge className="size-4" /> Limits
                  </CardTitle>
                  <CardDescription>Rolling estimates from this client.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {usage.limits.map((limit) => (
                    <LimitRow key={limit.id} limit={limit} />
                  ))}
                  {usage.limits.every((limit) => !limit.budget) ? (
                    <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                      Set <span className="font-mono">USAGE_*_BUDGET_USD</span> in the
                      environment to track limits.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="size-4" /> Models
                  </CardTitle>
                  <CardDescription>Most used this month.</CardDescription>
                </CardHeader>
                <CardContent>
                  {usage.models.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      The server did not report a model for these sessions.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {usage.models.map((model) => (
                        <li key={model.id}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate font-mono text-[11px]">
                              {model.id === "unknown" ? "Unknown model" : model.id}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              {formatPercent(model.percent)}
                            </span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{
                                width: `${Math.min(100, Math.max(1, model.percent))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted-foreground/50">
                            <span>{model.sessions} sessions</span>
                            <span>{formatTokens(model.tokens)} tokens</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Wallet className="size-4" /> Summary
                  </CardTitle>
                  <CardDescription>Billing and totals.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Sessions</span>
                    <span className="font-mono">{usage.totalSessions}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Input tokens</span>
                    <span className="font-mono">{formatTokens(usage.inputTokens)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Output tokens</span>
                    <span className="font-mono">{formatTokens(usage.outputTokens)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Estimated cost</span>
                    <span className="font-mono">{money(usage.totalCost)}</span>
                  </div>
                  <div className="border-t border-border/60 pt-2.5">
                    <Button variant="outline" size="sm" className="h-8 w-full" asChild>
                      <a
                        href="https://opencode.ai/console"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-3.5" /> OpenCode Console
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/60">
              Estimates use the cost/token totals reported for each session. They can
              differ from your OpenCode Go billing; use the OpenCode Console for exact
              limits and credits.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
