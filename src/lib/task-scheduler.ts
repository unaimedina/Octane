import { planSchedule } from "./task-schedule-plan";
import { reconcileTasks, taskNumber } from "./task-runner";
import { claimTask, launchWorker, type WorkerOptions } from "./task-workers";
import {
  getRunner,
  listTasks,
  mutateTasks,
  setRunner,
  type TaskRunnerSettings,
} from "./tasks";
import type { Task } from "./types";

export { planSchedule } from "./task-schedule-plan";

export type ScheduleResult = {
  /** Ids of the tasks started in worker sessions by this call. */
  started: string[];
  tasks: Task[];
  runner: TaskRunnerSettings;
};

function stalledMessage(tasks: Task[]): string {
  const open = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  ).length;
  return `Stopped: ${open} task(s) blocked or waiting on blocked tasks.`;
}

/**
 * One scheduling pass for a session: settle finished runs, then start as many
 * ready tasks in worker sessions as `maxParallel` allows. Claims are written
 * under the store lock (placeholder `run.sessionID === ""`), so concurrent
 * passes never pick the same task; OpenCode is only called outside the lock.
 * When auto-run is on and nothing is left to do, it turns auto-run off.
 */
export async function scheduleTasks(
  subject: string,
  sessionID: string,
  options: WorkerOptions = {},
): Promise<ScheduleResult> {
  await reconcileTasks(subject, sessionID);
  const runner = await getRunner(subject, sessionID);

  const startedAt = Date.now();
  const { result: claims = [], tasks: afterClaim } = await mutateTasks<Task[]>(
    subject,
    sessionID,
    (tasks) => {
      const plan = planSchedule(tasks, runner.maxParallel);
      if (plan.start.length === 0) return { result: [] };
      const ids = new Set(plan.start.map((task) => task.id));
      const claimed: Task[] = [];
      const next = tasks.map((task) => {
        if (!ids.has(task.id)) return task;
        const claim = claimTask(task, startedAt);
        claimed.push(claim);
        return claim;
      });
      return { tasks: next, result: claimed };
    },
  );

  const workerOptions: WorkerOptions = {
    ...options,
    model: options.model ?? runner.model,
  };
  const started: string[] = [];
  let failure: unknown;
  const launches = await Promise.allSettled(
    claims.map((claim) =>
      launchWorker(
        subject,
        sessionID,
        claim,
        workerOptions,
        taskNumber(claim, afterClaim),
      ),
    ),
  );
  launches.forEach((outcome, index) => {
    if (outcome.status === "fulfilled" && outcome.value) {
      started.push(claims[index].id);
    } else if (outcome.status === "rejected") {
      console.error("[autorun] worker failed to start:", outcome.reason);
      failure ??= outcome.reason;
    }
  });
  // Every launch failed: surface it so callers (and the ticker's back-off) see it.
  if (claims.length > 0 && started.length === 0 && failure) throw failure;

  let nextRunner = runner;
  if (runner.autoRun) {
    nextRunner = await setRunner(subject, sessionID, (current, tasks) => {
      if (!current.autoRun) return null;
      const plan = planSchedule(tasks, current.maxParallel);
      if (plan.done) return { autoRun: false, stalled: null };
      if (plan.stalled) return { autoRun: false, stalled: stalledMessage(tasks) };
      return null;
    });
  }

  return {
    started,
    tasks: await listTasks(subject, sessionID),
    runner: nextRunner,
  };
}
