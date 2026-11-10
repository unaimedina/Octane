import type { SessionWithHarness } from "./types";

export type UsageModel = {
  id: string;
  sessions: number;
  tokens: number;
  cost: number;
  percent: number;
};

export type UsageDay = {
  date: number;
  label: string;
  cost: number;
  tokens: number;
  sessions: number;
  cumulativeCost: number;
  cumulativeTokens: number;
  future: boolean;
};

export type UsageLimit = {
  id: "rolling" | "weekly" | "monthly";
  label: string;
  hint: string;
  used: number;
  budget: number | null;
  percent: number | null;
};

export type UsageForecast = {
  cost: number;
  percent: number | null;
};

export type UsageSummary = {
  generatedAt: number;
  monthLabel: string;
  periodStart: number;
  periodEnd: number;
  totalSessions: number;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  models: UsageModel[];
  days: UsageDay[];
  limits: UsageLimit[];
  forecast: UsageForecast;
  monthlyBudget: number | null;
  hasUsage: boolean;
};

export type UsageOptions = {
  now?: number;
  rollingBudget?: number | null;
  weeklyBudget?: number | null;
  monthlyBudget?: number | null;
};

const DAY = 86_400_000;

export function parseBudget(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function sessionTokens(session: SessionWithHarness): number {
  const tokens = session.tokens;
  if (!tokens) return 0;
  return tokens.input + tokens.output + tokens.reasoning;
}

function modelId(session: SessionWithHarness): string {
  return session.model?.id ?? session.model?.modelID ?? "unknown";
}

function percent(used: number, budget: number | null): number | null {
  if (!budget || budget <= 0) return null;
  return (used / budget) * 100;
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function buildUsageSummary(
  sessions: SessionWithHarness[],
  options: UsageOptions = {},
): UsageSummary {
  const now = options.now ?? Date.now();
  const current = new Date(now);
  const monthStartDate = new Date(
    current.getFullYear(),
    current.getMonth(),
    1,
  );
  const monthEndDate = new Date(
    current.getFullYear(),
    current.getMonth() + 1,
    1,
  );
  const monthStart = monthStartDate.getTime();
  const monthEnd = monthEndDate.getTime();
  const daysInMonth = new Date(
    current.getFullYear(),
    current.getMonth() + 1,
    0,
  ).getDate();
  const today = current.getDate();

  const monthSessions = sessions.filter((session) => {
    const created = session.time.created;
    return created >= monthStart && created < monthEnd;
  });

  const days: UsageDay[] = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(
      current.getFullYear(),
      current.getMonth(),
      index + 1,
    );
    return {
      date: date.getTime(),
      label: formatDay(date),
      cost: 0,
      tokens: 0,
      sessions: 0,
      cumulativeCost: 0,
      cumulativeTokens: 0,
      future: index + 1 > today,
    };
  });

  const models = new Map<string, UsageModel>();
  let totalCost = 0;
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const session of monthSessions) {
    const cost = session.cost ?? 0;
    const tokens = sessionTokens(session);
    totalCost += cost;
    totalTokens += tokens;
    inputTokens += session.tokens?.input ?? 0;
    outputTokens += session.tokens?.output ?? 0;

    const dayIndex = new Date(session.time.created).getDate() - 1;
    const day = days[dayIndex];
    if (day) {
      day.cost += cost;
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

  let cumulativeCost = 0;
  let cumulativeTokens = 0;
  for (const day of days) {
    cumulativeCost += day.cost;
    cumulativeTokens += day.tokens;
    day.cumulativeCost = cumulativeCost;
    day.cumulativeTokens = cumulativeTokens;
  }

  const modelList = [...models.values()]
    .map((model) => ({
      ...model,
      percent:
        totalTokens > 0
          ? (model.tokens / totalTokens) * 100
          : monthSessions.length > 0
            ? (model.sessions / monthSessions.length) * 100
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

  const rollingUsed = sessions
    .filter((session) => session.time.updated >= now - DAY)
    .reduce((sum, session) => sum + (session.cost ?? 0), 0);
  const weeklyUsed = sessions
    .filter((session) => session.time.updated >= now - 7 * DAY)
    .reduce((sum, session) => sum + (session.cost ?? 0), 0);

  const monthlyBudget = options.monthlyBudget ?? null;
  const limits: UsageLimit[] = [
    {
      id: "rolling",
      label: "Rolling",
      hint: "Last 24 hours",
      used: rollingUsed,
      budget: options.rollingBudget ?? null,
      percent: percent(rollingUsed, options.rollingBudget ?? null),
    },
    {
      id: "weekly",
      label: "Weekly",
      hint: "Last 7 days",
      used: weeklyUsed,
      budget: options.weeklyBudget ?? null,
      percent: percent(weeklyUsed, options.weeklyBudget ?? null),
    },
    {
      id: "monthly",
      label: "Monthly",
      hint: `Renews ${new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(monthEndDate)}`,
      used: totalCost,
      budget: monthlyBudget,
      percent: percent(totalCost, monthlyBudget),
    },
  ];

  const daysElapsed = Math.max(1, today);
  const forecastCost = (totalCost / daysElapsed) * daysInMonth;

  return {
    generatedAt: now,
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(current),
    periodStart: monthStart,
    periodEnd: monthEnd,
    totalSessions: monthSessions.length,
    totalCost,
    totalTokens,
    inputTokens,
    outputTokens,
    models: topModels,
    days,
    limits,
    forecast: {
      cost: forecastCost,
      percent: percent(forecastCost, monthlyBudget),
    },
    monthlyBudget,
    hasUsage: monthSessions.length > 0 || totalCost > 0 || totalTokens > 0,
  };
}
