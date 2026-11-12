"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Gauge, RefreshCw } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { UsageChart } from "@/components/usage/usage-chart";
import { Button } from "@/components/ui/button";
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
          <span className="text-xs">{limit.label}</span>
          <span className="ml-1.5 text-[11px] text-muted-foreground">{limit.hint}</span>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {limit.budget ? `${formatPercent(limit.percent)} used` : money(limit.used)}
        </span>
      </div>
      <div className="h-1 overflow-hidden bg-muted">
        <div
          className={cn("h-full transition-[width]", limitTone(limit.percent))}
          style={{
            width: `${Math.min(100, Math.max(1, limit.percent ?? (limit.used > 0 ? 2 : 0)))}%`,
          }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{money(limit.used)}</span>
        <span>{limit.budget ? money(limit.budget) : "no budget set"}</span>
      </div>
    </div>
  );
}

function Readout({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</div> : null}
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
  // Orange marks only the most used model.
  const leaderPercent = Math.max(0, ...usage.models.map((model) => model.percent));

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="headline text-[26px] leading-tight">Usage</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Estimated from sessions in this web client · {usage.monthLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh usage"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>

        {!usage.hasUsage ? (
          <div className="flex flex-col items-center gap-2 border-t border-border py-14 text-center">
            <Gauge className="size-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-[13px] font-medium">No usage recorded this month</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Start a session and the local usage estimate will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 divide-border border-y border-border sm:grid-cols-4 sm:divide-x [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:border-border sm:[&>*:nth-child(even)]:border-l-0 [&>*:nth-child(-n+2)]:border-b sm:[&>*:nth-child(-n+2)]:border-b-0">
              <Readout
                label="Estimated cost"
                value={money(usage.totalCost)}
                sub={
                  usage.monthlyBudget
                    ? `${formatPercent(monthlyPercent)} of ${money(usage.monthlyBudget)}`
                    : undefined
                }
              />
              <Readout label="Input tokens" value={formatTokens(usage.inputTokens)} />
              <Readout label="Output tokens" value={formatTokens(usage.outputTokens)} />
              <Readout label="Sessions" value={String(usage.totalSessions)} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {usage.monthlyBudget
                ? `On pace for ${formatPercent(usage.forecast.percent)} · ${money(usage.forecast.cost)} projected`
                : `${money(usage.forecast.cost)} projected by the end of the month`}
            </p>

            <section className="mt-6 border-t border-border py-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[13px] font-medium">This month</h2>
                <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-brand" aria-hidden="true" /> Usage
                  </span>
                  {usage.monthlyBudget ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-4 border-t border-dashed border-muted-foreground"
                          aria-hidden="true"
                        />
                        Forecast
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="status-square bg-warning" aria-hidden="true" />
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
              />
            </section>

            <div className="grid gap-x-10 border-t border-border md:grid-cols-2">
              <section className="py-6">
                <h2 className="text-[13px] font-medium">Most used this month</h2>
                {usage.models.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    The server did not report a model for these sessions.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {usage.models.map((model) => (
                      <li key={model.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate font-mono text-[11px]">
                            {model.id === "unknown" ? "Unknown model" : model.id}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {formatTokens(model.tokens)} tokens · {formatPercent(model.percent)}
                          </span>
                        </div>
                        <div className="mt-1 h-0.5 bg-muted">
                          <div
                            className={cn(
                              "h-full",
                              model.percent === leaderPercent
                                ? "bg-brand"
                                : "bg-muted-foreground/40",
                            )}
                            style={{ width: `${Math.min(100, Math.max(1, model.percent))}%` }}
                          />
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {model.sessions} session{model.sessions === 1 ? "" : "s"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="border-t border-border py-6 md:border-t-0">
                <h2 className="text-[13px] font-medium">Limits</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rolling estimates from this client.
                </p>
                <div className="mt-3 space-y-4">
                  {usage.limits.map((limit) => (
                    <LimitRow key={limit.id} limit={limit} />
                  ))}
                  {usage.limits.every((limit) => !limit.budget) ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Set <span className="font-mono">USAGE_*_BUDGET_USD</span> in the
                      environment to track limits.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
              Estimates use the cost/token totals reported for each session. They can
              differ from your OpenCode Go billing; use the{" "}
              <a
                href="https://opencode.ai/console"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                OpenCode Console <ExternalLink className="size-3" />
              </a>{" "}
              for exact limits and credits.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
