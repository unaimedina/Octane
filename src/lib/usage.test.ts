import assert from "node:assert/strict";
import { test } from "node:test";
import type { GoUsageResult } from "./go-usage.ts";
import { buildUsageSummary, subtractOneMonth } from "./usage.ts";
import type { SessionWithHarness } from "./types.ts";

const DAY = 86_400_000;

type TokenParts = {
  input?: number;
  output?: number;
  reasoning?: number;
  read?: number;
  write?: number;
};

function session(
  id: string,
  created: number,
  tokens: TokenParts = {},
  cost = 0,
): SessionWithHarness {
  return {
    id,
    projectID: "project",
    directory: "/tmp",
    title: id,
    version: "1",
    time: { created, updated: created },
    harness: "opencode",
    cost,
    tokens: {
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
      reasoning: tokens.reasoning ?? 0,
      cache: { read: tokens.read ?? 0, write: tokens.write ?? 0 },
    },
    model: { id: "opencode-go/kimi" },
  };
}

function goUsage(
  monthlyPercent: number,
  resetsAt: number,
  now: number,
): GoUsageResult {
  return {
    ok: true,
    windows: [
      { id: "rolling", percent: 5, status: "ok", resetsAt: now + DAY },
      { id: "weekly", percent: 2, status: "ok", resetsAt: now + 7 * DAY },
      { id: "monthly", percent: monthlyPercent, status: "ok", resetsAt },
    ],
  };
}

test("zero-cost sessions with tokens still count as usage", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const sessions = [
    session("a", new Date(2026, 10, 1, 9).getTime(), {
      input: 4_900_000,
      output: 600_000,
    }),
    session("b", new Date(2026, 10, 10, 9).getTime(), {
      input: 4_900_000,
      output: 600_000,
    }),
  ];

  const usage = buildUsageSummary(sessions, { now });

  assert.equal(usage.source, "local");
  assert.equal(usage.hasUsage, true);
  assert.equal(usage.totalTokens, 11_000_000);
  assert.equal(usage.totalCost, 0);
  assert.equal(usage.percent, null);
  assert.equal(usage.pace, null);
});

test("subtractOneMonth clamps the day to the previous month", () => {
  assert.equal(
    subtractOneMonth(new Date(2026, 2, 31, 12).getTime()),
    new Date(2026, 1, 28, 12).getTime(),
  );
  assert.equal(
    subtractOneMonth(new Date(2026, 0, 31, 12).getTime()),
    new Date(2025, 11, 31, 12).getTime(),
  );
});

test("Go mode takes the billing period from monthly.resetsAt", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const resetsAt = new Date(2026, 10, 30, 12).getTime();
  const usage = buildUsageSummary([], {
    now,
    goUsage: goUsage(7, resetsAt, now),
  });

  assert.equal(usage.source, "go");
  assert.equal(usage.percent, 7);
  assert.equal(usage.periodEnd, resetsAt);
  assert.equal(usage.periodStart, new Date(2026, 9, 30, 12).getTime());
  assert.equal(usage.hasUsage, true);
  assert.equal(usage.monthlyBudget, null);
  assert.deepEqual(
    usage.windows.map((window) => window.id),
    ["rolling", "weekly", "monthly"],
  );
});

test("the last elapsed day matches the API percentage and never decreases", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const resetsAt = new Date(2026, 10, 30, 12).getTime();
  const sessions = [
    session("a", new Date(2026, 9, 31, 9).getTime(), { input: 1_000_000 }),
    session("b", new Date(2026, 10, 5, 9).getTime(), { input: 2_000_000 }),
    session("c", new Date(2026, 10, 12, 9).getTime(), { input: 4_000_000 }),
  ];

  const usage = buildUsageSummary(sessions, {
    now,
    goUsage: goUsage(7, resetsAt, now),
  });

  const elapsed = usage.days.filter((day) => !day.future);
  const last = elapsed.at(-1);
  assert.ok(last);
  assert.ok(Math.abs((last?.percent ?? 0) - 7) < 1e-6);
  for (let index = 1; index < elapsed.length; index += 1) {
    assert.ok(elapsed[index].percent >= elapsed[index - 1].percent - 1e-9);
  }
});

test("future days are flagged and stay at zero", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const resetsAt = new Date(2026, 10, 30, 12).getTime();
  const usage = buildUsageSummary(
    [session("a", new Date(2026, 10, 10, 9).getTime(), { input: 1_000 })],
    { now, goUsage: goUsage(7, resetsAt, now) },
  );

  const future = usage.days.filter((day) => day.future);
  assert.ok(future.length > 0);
  for (const day of future) assert.equal(day.percent, 0);
});

test("pace follows the percentage and the elapsed days", () => {
  // Mar 30 minus one month is Feb 28: a 30-day window.
  const periodEnd = new Date(2026, 2, 30, 12).getTime();
  const now = new Date(2026, 2, 10, 12).getTime();
  const usage = buildUsageSummary([], {
    now,
    goUsage: goUsage(22, periodEnd, now),
  });

  assert.ok(usage.pace);
  assert.ok(Math.abs((usage.pace?.percentPerDay ?? 0) - 2.2) < 1e-9);
  // A DST change can shave an hour off the last days; keep a small tolerance.
  assert.ok(Math.abs((usage.pace?.projectedAtReset ?? 0) - 66) < 0.2);
  assert.equal(usage.pace?.eta, null);
});

test("zero percent means no pace", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const usage = buildUsageSummary([], {
    now,
    goUsage: goUsage(0, new Date(2026, 10, 30, 12).getTime(), now),
  });

  assert.equal(usage.pace, null);
  assert.equal(usage.percent, 0);
});

test("local mode derives the percentage from budgets", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const sessions = [session("a", now - DAY / 2, { input: 1_000 }, 10)];

  const usage = buildUsageSummary(sessions, {
    now,
    rollingBudget: 50,
    weeklyBudget: 50,
    monthlyBudget: 100,
  });

  assert.equal(usage.source, "local");
  assert.equal(usage.percent, 10);
  assert.deepEqual(
    usage.windows.map((window) => window.id),
    ["rolling", "weekly", "monthly"],
  );
});

test("local mode without budgets has no windows", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const usage = buildUsageSummary([session("a", now - DAY, { input: 10 }, 1)], {
    now,
  });

  assert.equal(usage.windows.length, 0);
  assert.equal(usage.percent, null);
});

test("cache tokens are included in the total", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const usage = buildUsageSummary(
    [
      session("a", now - DAY, {
        input: 100,
        output: 20,
        reasoning: 5,
        read: 1_000,
        write: 500,
      }),
    ],
    { now },
  );

  assert.equal(usage.totalTokens, 1_625);
  assert.equal(usage.inputTokens, 100);
  assert.equal(usage.outputTokens, 20);
});

test("Go mode still reports no-key reasons as local", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const usage = buildUsageSummary([], {
    now,
    goUsage: { ok: false, reason: "no-key" },
  });

  assert.equal(usage.source, "local");
  assert.equal(usage.reason, "no-key");
  assert.equal(usage.hasUsage, false);
});
