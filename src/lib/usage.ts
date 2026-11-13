import type { GoUsageFailure, GoUsageResult, GoUsageWindowId } from "./go-usage";
import type { SessionWithHarness } from "./types";

export type UsageSource = "go" | "local";

export type UsageModel = {
  id: string;
  sessions: number;
  tokens: number;
  cost: number;
  percent: number;
};

export type UsageWindow = {
  id: "rolling" | "weekly" | "monthly";
  label: string;
  /** Percentage used, 0..100. */
  percent: number;
  resetsAt: number | null;
  status: "ok" | "rate-limited";
};

export type UsagePace = {
  percentPerDay: number;
  /** Timestamp when 100% is reached, only when it happens before periodEnd. */
  eta: number | null;
  /** Percentage projected at periodEnd at the current pace. */
  projectedAtReset: number;
};

export type UsageDay = {
  date: number;
  label: string;
  /** Cumulative percentage used that day (0 for future days). */
  percent: number;
  tokens: number;
  cumulativeTokens: number;
  sessions: number;
  future: boolean;
};

export type UsageSummary = {
  generatedAt: number;
  source: UsageSource;
  /** Only set when source === "local". */
  reason?: GoUsageFailure;
  monthLabel: string;
  periodStart: number;
  periodEnd: number;
  /** Headline percentage used; the monthly window in Go mode. */
  percent: number | null;
  pace: UsagePace | null;
  windows: UsageWindow[];
  totalSessions: number;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  models: UsageModel[];
  days: UsageDay[];
  /** Local fallback bar; null in Go mode. */
  monthlyBudget: number | null;
  hasUsage: boolean;
};

export type UsageOptions = {
  now?: number;
  goUsage?: GoUsageResult;
  rollingBudget?: number | null;
  weeklyBudget?: number | null;
  monthlyBudget?: number | null;
};

const DAY = 86_400_000;

const WINDOW_LABELS: Record<GoUsageWindowId, string> = {
  rolling: "Rolling",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function parseBudget(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function sessionTokens(session: SessionWithHarness): number {
  const tokens = session.tokens;
  if (!tokens) return 0;
  return (
    tokens.input +
    tokens.output +
    tokens.reasoning +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  );
}

function modelId(session: SessionWithHarness): string {
  return session.model?.id ?? session.model?.modelID ?? "unknown";
}

function budgetPercent(used: number, budget: number | null | undefined): number | null {
  if (!budget || budget <= 0) return null;
  return (used / budget) * 100;
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function startOfDay(ts: number): number {
  const date = new Date(ts);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * One month before `ts`, keeping the time of day and clamping the day to the
 * last day of that month (Jan 31 → Dec 31, Mar 31 → Feb 28).
 */
export function subtractOneMonth(ts: number): number {
  const date = new Date(ts);
  const day = date.getDate();
  const target = new Date(
    date.getFullYear(),
    date.getMonth() - 1,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target.getTime();
}

function localWindows(
  sessions: SessionWithHarness[],
  now: number,
  options: UsageOptions,
  totalCost: number,
): UsageWindow[] {
  const rollingBudget = options.rollingBudget ?? null;
  const weeklyBudget = options.weeklyBudget ?? null;
  const monthlyBudget = options.monthlyBudget ?? null;

  const rollingUsed = sessions
    .filter((session) => session.time.updated >= now - DAY)
    .reduce((sum, session) => sum + (session.cost ?? 0), 0);
  const weeklyUsed = sessions
    .filter((session) => session.time.updated >= now - 7 * DAY)
    .reduce((sum, session) => sum + (session.cost ?? 0), 0);

  const windows: UsageWindow[] = [];
  const rollingPercent = budgetPercent(rollingUsed, rollingBudget);
  if (rollingPercent !== null) {
    windows.push({
      id: "rolling",
      label: WINDOW_LABELS.rolling,
      percent: rollingPercent,
      resetsAt: null,
      status: "ok",
    });
  }
  const weeklyPercent = budgetPercent(weeklyUsed, weeklyBudget);
  if (weeklyPercent !== null) {
    windows.push({
      id: "weekly",
      label: WINDOW_LABELS.weekly,
      percent: weeklyPercent,
      resetsAt: null,
      status: "ok",
    });
  }
  const monthlyPercent = budgetPercent(totalCost, monthlyBudget);
  if (monthlyPercent !== null) {
    windows.push({
      id: "monthly",
      label: WINDOW_LABELS.monthly,
      percent: monthlyPercent,
      resetsAt: null,
      status: "ok",
    });
  }
  return windows;
}

export function buildUsageSummary(
  sessions: SessionWithHarness[],
  options: UsageOptions = {},
): UsageSummary {
  const now = options.now ?? Date.now();
  const go = options.goUsage;

  const monthly = go?.ok
    ? go.windows.find((window) => window.id === "monthly")
    : undefined;
  const goMonthly = monthly?.resetsAt && monthly.resetsAt > now ? monthly : null;

  let source: UsageSource = "local";
  let reason: GoUsageFailure | undefined;
  let periodStart: number;
  let periodEnd: number;
  let percent: number | null;
  let windows: UsageWindow[] = [];

  if (go?.ok && goMonthly) {
    source = "go";
    periodEnd = goMonthly.resetsAt as number;
    periodStart = subtractOneMonth(periodEnd);
    percent = goMonthly.percent;
    windows = go.windows.map((window) => ({
      id: window.id,
      label: WINDOW_LABELS[window.id],
      percent: window.percent,
      resetsAt: window.resetsAt,
      status: window.status,
    }));
  } else {
    if (go && !go.ok) reason = go.reason;
    const current = new Date(now);
    periodStart = new Date(current.getFullYear(), current.getMonth(), 1).getTime();
    periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 1).getTime();
    percent = null;
  }

  const periodSessions = sessions.filter((session) => {
    const created = session.time.created;
    return created >= periodStart && created < periodEnd;
  });

  const days: UsageDay[] = [];
  const dayIndexByMidnight = new Map<number, number>();
  for (
    let cursor = startOfDay(periodStart);
    cursor < periodEnd;
    cursor = startOfDay(cursor + DAY + DAY / 2)
  ) {
    const date = new Date(cursor);
    dayIndexByMidnight.set(cursor, days.length);
    days.push({
      date: cursor,
      label: formatDay(date),
      percent: 0,
      tokens: 0,
      cumulativeTokens: 0,
      sessions: 0,
      future: cursor > now,
    });
  }

  const models = new Map<string, UsageModel>();
  let totalCost = 0;
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const session of periodSessions) {
    const cost = session.cost ?? 0;
    const tokens = sessionTokens(session);
    totalCost += cost;
    totalTokens += tokens;
    inputTokens += session.tokens?.input ?? 0;
    outputTokens += session.tokens?.output ?? 0;

    const dayIndex = dayIndexByMidnight.get(startOfDay(session.time.created));
    const day = dayIndex === undefined ? undefined : days[dayIndex];
    if (day) {
      day.tokens += tokens;
      day.sessions += 1;
    }

    const id = modelId(session);
    const model = models.get(id) ?? {
      id,
      sessions: 0,
      tokens: 0,
      cost: 0,
      percent: 0,
    };
    model.sessions += 1;
    model.tokens += tokens;
    model.cost += cost;
    models.set(id, model);
  }

  let cumulativeTokens = 0;
  for (const day of days) {
    cumulativeTokens += day.tokens;
    day.cumulativeTokens = cumulativeTokens;
  }

  // Local fallback: derive the percentage from the configured budgets.
  if (source === "local") {
    percent = budgetPercent(totalCost, options.monthlyBudget ?? null);
    windows = localWindows(sessions, now, options, totalCost);
  }

  // Shape from local sessions, level from the OpenCode Go API: the last elapsed
  // point always equals the reported monthly percentage.
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.future) === -1
      ? days.length - 1
      : days.findIndex((day) => day.future) - 1,
  );
  const todayTokens = days[todayIndex]?.cumulativeTokens ?? 0;
  for (const day of days) {
    if (day.future) continue;
    if (percent === null) {
      day.percent = 0;
    } else if (todayTokens > 0) {
      day.percent = percent * (day.cumulativeTokens / todayTokens);
    } else {
      day.percent = percent;
    }
  }

  const modelList = [...models.values()]
    .map((model) => ({
      ...model,
      percent:
        totalTokens > 0
          ? (model.tokens / totalTokens) * 100
          : periodSessions.length > 0
            ? (model.sessions / periodSessions.length) * 100
            : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens || b.sessions - a.sessions);

  const topModels =
    modelList.length > 6
      ? [
          ...modelList.slice(0, 5),
          {
            id: "other",
            sessions: modelList.slice(5).reduce((sum, m) => sum + m.sessions, 0),
            tokens: modelList.slice(5).reduce((sum, m) => sum + m.tokens, 0),
            cost: modelList.slice(5).reduce((sum, m) => sum + m.cost, 0),
            percent: modelList.slice(5).reduce((sum, m) => sum + m.percent, 0),
          },
        ]
      : modelList;

  const elapsedDays = Math.max(1, (now - periodStart) / DAY);
  const remainingDays = Math.max(0, (periodEnd - now) / DAY);
  const percentPerDay = percent !== null && percent > 0 ? percent / elapsedDays : 0;
  let pace: UsagePace | null = null;
  if (percentPerDay > 0 && percent !== null) {
    const projectedAtReset = Math.min(150, percent + percentPerDay * remainingDays);
    let eta: number | null =
      percent < 100 ? now + ((100 - percent) / percentPerDay) * DAY : null;
    if (eta !== null && eta > periodEnd) eta = null;
    pace = { percentPerDay, eta, projectedAtReset };
  }

  return {
    generatedAt: now,
    source,
    ...(source === "local" && reason ? { reason } : {}),
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(new Date(periodStart)),
    periodStart,
    periodEnd,
    percent,
    pace,
    windows,
    totalSessions: periodSessions.length,
    totalCost,
    totalTokens,
    inputTokens,
    outputTokens,
    models: topModels,
    days,
    monthlyBudget: source === "go" ? null : (options.monthlyBudget ?? null),
    hasUsage:
      periodSessions.length > 0 ||
      totalTokens > 0 ||
      totalCost > 0 ||
      source === "go" ||
      windows.length > 0,
  };
}
