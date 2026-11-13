"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Gauge, RefreshCw } from "lucide-react";
import { UsageChart } from "@/components/usage/usage-chart";
import { Button } from "@/components/ui/button";
import { formatResetIn } from "@/lib/format";
import type { UsageSummary, UsageWindow } from "@/lib/usage";
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

function formatShare(percent: number): string {
  if (percent <= 0) return "0%";
  if (percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(ts);
}

function limitTone(percent: number, status: "ok" | "rate-limited"): string {
  if (status === "rate-limited" || percent >= 90) return "bg-destructive";
  if (percent >= 75) return "bg-warning";
  return "bg-success";
}

function reasonCopy(reason: UsageSummary["reason"]): string {
  switch (reason) {
    case "no-key":
      return "Go limits are not connected. Sign in to OpenCode Go in Settings, or set OPENCODE_GO_API_KEY.";
    case "unauthorized":
      return "The OpenCode Go key was rejected. Sign in again or update OPENCODE_GO_API_KEY.";
    case "unreachable":
      return "Could not reach the OpenCode usage service. Showing local estimates.";
    case "invalid":
      return "The usage service returned an unexpected response.";
    default:
      return "Set USAGE_MONTHLY_BUDGET_USD to turn local spend into a percentage.";
  }
}

function LimitRow({ window, now }: { window: UsageWindow; now: number | null }) {
  const reset =
    window.resetsAt === null
      ? null
      : now === null
        ? `Resets ${formatDate(window.resetsAt)}`
        : `Resets in ${formatResetIn(window.resetsAt - now)}`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs">{window.label}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatPercent(window.percent)} used
        </span>
      </div>
      {reset ? <div className="text-[11px] text-muted-foreground">{reset}</div> : null}
      <div className="h-1 overflow-hidden bg-muted">
        <div
          className={cn("h-full transition-[width]", limitTone(window.percent, window.status))}
          style={{ width: `${Math.min(100, Math.max(1, window.percent))}%` }}
        />
      </div>
    </div>
  );
}

function ConsoleLink({ className }: { className?: string }) {
  return (
    <Button variant="outline" size="sm" className={cn("h-8", className)} asChild>
      <a href="https://opencode.ai/console" target="_blank" rel="noreferrer">
        Open Console <ExternalLink className="size-3.5" />
      </a>
    </Button>
  );
}

export function UsageView({ usage }: { usage: UsageSummary }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    // Countdowns start after hydration so the server HTML stays stable.
    const start = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, []);

  // Orange marks only the most used model.
  const leaderPercent = Math.max(0, ...usage.models.map((model) => model.percent));
  const pace = usage.pace;
  const paceText =
    pace?.eta !== null && pace?.eta !== undefined
      ? `On pace to hit the limit ${formatDate(pace.eta)}`
      : usage.percent !== null && pace
        ? `On pace to reach ${Math.round(pace.projectedAtReset)}% by ${formatDate(usage.periodEnd)}`
        : null;
  const subtitle =
    usage.source === "go"
      ? `Go usage · Renews ${formatDate(usage.periodEnd)}`
      : `Estimated from sessions in this web client · ${usage.monthLabel}`;

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
              {subtitle}
              {paceText ? (
                <>
                  {" · "}
                  <span className={pace?.eta ? "text-warning" : undefined}>{paceText}</span>
                </>
              ) : null}
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
            <p className="text-[13px] font-medium">No usage recorded this period</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Start a session and the local usage estimate will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline gap-2">
                {usage.percent !== null ? (
                  <>
                    <span className="font-mono text-[34px] leading-none tabular-nums">
                      {Math.round(usage.percent)}
                    </span>
                    <span className="text-xs text-muted-foreground">% used this period</span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-[34px] leading-none tabular-nums">
                      {formatTokens(usage.totalTokens)}
                    </span>
                    <span className="text-xs text-muted-foreground">tokens this period</span>
                  </>
                )}
              </div>
            </div>

            <section className="mt-5 border-t border-border pt-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[13px] font-medium">This period</h2>
                <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="status-square bg-success" aria-hidden="true" /> Usage
                  </span>
                  {usage.percent !== null ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="status-square bg-warning" aria-hidden="true" /> Forecast
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-4 border-t border-dashed border-muted-foreground"
                          aria-hidden="true"
                        />
                        Monthly limit
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <UsageChart
                days={usage.days}
                unit={usage.percent !== null ? "percent" : "tokens"}
                forecast={
                  pace
                    ? { eta: pace.eta, projectedAtReset: pace.projectedAtReset }
                    : null
                }
              />
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                <span>
                  {pace
                    ? `Averaging ${
                        pace.percentPerDay < 10
                          ? pace.percentPerDay.toFixed(1)
                          : Math.round(pace.percentPerDay)
                      }% a day`
                    : ""}
                </span>
                <span>{formatDate(usage.periodEnd)}</span>
              </div>
            </section>

            <div className="mt-6 grid border-t border-border md:grid-cols-3 md:divide-x md:divide-border">
              <section className="py-6 md:px-6 md:pl-0">
                <h2 className="text-[13px] font-medium">Limits</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  When your Go usage resets
                </p>
                {usage.windows.length > 0 ? (
                  <div className="mt-3 space-y-4">
                    {usage.windows.map((window) => (
                      <LimitRow key={window.id} window={window} now={now} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    {reasonCopy(usage.reason)}
                  </p>
                )}
                <div className="mt-3">
                  <ConsoleLink />
                </div>
              </section>

              <section className="border-t border-border py-6 md:border-t-0 md:px-6">
                <h2 className="text-[13px] font-medium">Models</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Most used this period</p>
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
                            {formatShare(model.percent)}
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
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 divide-y divide-border border-t border-border">
                  <div className="flex justify-between py-2 text-[11px]">
                    <span className="text-muted-foreground">Sessions</span>
                    <span className="font-mono">{usage.totalSessions}</span>
                  </div>
                  <div className="flex justify-between py-2 text-[11px]">
                    <span className="text-muted-foreground">Tokens</span>
                    <span className="font-mono">{formatTokens(usage.totalTokens)}</span>
                  </div>
                  {usage.totalCost > 0 ? (
                    <div className="flex justify-between py-2 text-[11px]">
                      <span className="text-muted-foreground">Reported cost</span>
                      <span className="font-mono">{money(usage.totalCost)}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="border-t border-border py-6 md:border-t-0 md:px-6 md:pr-0">
                <h2 className="text-[13px] font-medium">Account</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Managed in OpenCode Console
                </p>
                {usage.source === "go" ? (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Limits are read from the OpenCode Go usage API. Totals, models and
                    sessions are estimated from this client only.
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Limits are unavailable, so this page shows local estimates from this
                    client only. {reasonCopy(usage.reason)}
                  </p>
                )}
                <div className="mt-3">
                  <ConsoleLink />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Updated {formatDate(usage.generatedAt)}
                </p>
              </section>
            </div>

            <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
              Percentages come from the OpenCode Go usage API. Tokens, sessions and model
              shares are estimated from this web client&apos;s sessions. Use the{" "}
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
