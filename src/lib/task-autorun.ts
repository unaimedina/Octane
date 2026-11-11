import type { SessionInfo } from "./auth";
import { scheduleTasks } from "./task-scheduler";
import { getRunner, setRunner } from "./tasks";
import { runWithUpstream, upstreamForSession } from "./tenant";

/**
 * Server-side auto-run ticker. One interval per (user, session) lives in this
 * Next server process, so auto-run continues with the tab closed. A restart
 * pauses it until someone opens the session again (GET /tasks re-arms it).
 * Single-instance only: several Next instances would run duplicate tickers.
 */
const TICK_MS = 5_000;
const MAX_FAILURES = 5;

type Ticker = {
  timer: NodeJS.Timeout;
  inFlight: boolean;
  failures: number;
};

const state = globalThis as typeof globalThis & {
  __octaneTaskTickers?: Map<string, Ticker>;
};
// Kept on globalThis so dev hot reloads do not start duplicate intervals.
const tickers = (state.__octaneTaskTickers ??= new Map<string, Ticker>());

function tickerKey(subject: string, sessionID: string): string {
  return `${subject}:${sessionID}`;
}

/** Readable message, unwrapping OpenCode's JSON error bodies. */
export function describeError(error: unknown): string {
  const message =
    error instanceof Error && error.message ? error.message : String(error);
  try {
    const parsed = JSON.parse(message) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // plain text
  }
  return message;
}

export function stopAutoRun(subject: string, sessionID: string): void {
  const key = tickerKey(subject, sessionID);
  const ticker = tickers.get(key);
  if (!ticker) return;
  clearInterval(ticker.timer);
  tickers.delete(key);
}

async function tick(info: SessionInfo, sessionID: string, ticker: Ticker): Promise<void> {
  const subject = info.subject;
  try {
    // The interval runs outside any request, so bind the user's OpenCode
    // server explicitly instead of reading cookies.
    const target = await upstreamForSession(info);
    await runWithUpstream(target, () => scheduleTasks(subject, sessionID));
    ticker.failures = 0;
    const runner = await getRunner(subject, sessionID);
    if (!runner.autoRun) stopAutoRun(subject, sessionID);
  } catch (error) {
    ticker.failures += 1;
    console.error("[autorun]", sessionID, error);
    if (ticker.failures >= MAX_FAILURES) {
      stopAutoRun(subject, sessionID);
      await setRunner(subject, sessionID, {
        autoRun: false,
        stalled: `Stopped after ${MAX_FAILURES} failed attempts: ${describeError(error)}`.slice(0, 500),
      }).catch((cause) => console.error("[autorun]", sessionID, cause));
    }
  }
}

/** Start the ticker for a session unless one is already running. */
export function ensureAutoRun(info: SessionInfo, sessionID: string): void {
  const key = tickerKey(info.subject, sessionID);
  if (tickers.has(key)) return;
  const ticker: Ticker = {
    timer: undefined as unknown as NodeJS.Timeout,
    inFlight: false,
    failures: 0,
  };
  ticker.timer = setInterval(() => {
    if (ticker.inFlight || tickers.get(key) !== ticker) return;
    ticker.inFlight = true;
    void tick(info, sessionID, ticker).finally(() => {
      ticker.inFlight = false;
    });
  }, TICK_MS);
  // Do not keep the process alive just for auto-run.
  ticker.timer.unref?.();
  tickers.set(key, ticker);
}
