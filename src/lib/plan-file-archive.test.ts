import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { archivePlanFile, archiveTarget } from "./plan-file-archive.ts";
import type { Task } from "./types.ts";

function planTask(file: string, ref: string): Task {
  return {
    id: "tsk_1",
    sessionID: "ses_1",
    title: "001 · Plan",
    description: "",
    prompt: "",
    status: "pending",
    priority: "medium",
    dependsOn: [],
    createdAt: 0,
    updatedAt: 0,
    source: { kind: "plan-file", ref, path: file },
  } as Task;
}

test("archiveTarget maps plan files into done/", () => {
  assert.deepEqual(archiveTarget("/workspace/app/plans/001-fix-x.md"), {
    target: "/workspace/app/plans/done/001-fix-x.md",
    ref: "plans/done/001-fix-x.md",
  });
  assert.deepEqual(archiveTarget(String.raw`C:\repo\advisor-plans\002-y.md`), {
    target: "C:/repo/advisor-plans/done/002-y.md",
    ref: "advisor-plans/done/002-y.md",
  });
});

test("archiveTarget rejects anything that is not a top-level plan file", () => {
  assert.equal(archiveTarget(""), null);
  assert.equal(archiveTarget("/workspace/app/plans/README.md"), null);
  assert.equal(archiveTarget("/workspace/app/src/001-x.md"), null);
  assert.equal(archiveTarget("/workspace/app/plans/done/001-x.md"), null);
  assert.equal(archiveTarget("/workspace/app/plans/001-x.txt"), null);
});

test("archivePlanFile moves the file and avoids overwriting", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "octane-archive-"));
  try {
    const plans = path.join(root, "plans");
    await fs.mkdir(path.join(plans, "done"), { recursive: true });
    const file = path.join(plans, "001-fix-x.md");
    await fs.writeFile(file, "# Plan 001: Fix x\n");
    await fs.writeFile(path.join(plans, "done", "001-fix-x.md"), "older\n");

    const result = await archivePlanFile(planTask(file, "plans/001-fix-x.md"));
    assert.deepEqual(result, { archived: "plans/done/001-fix-x-2.md" });
    await assert.rejects(fs.access(file));
    assert.equal(
      await fs.readFile(path.join(plans, "done", "001-fix-x-2.md"), "utf8"),
      "# Plan 001: Fix x\n",
    );
    assert.equal(await fs.readFile(path.join(plans, "done", "001-fix-x.md"), "utf8"), "older\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("archivePlanFile warns instead of failing", async () => {
  const missing = await archivePlanFile(
    planTask(path.join(os.tmpdir(), "nope", "plans", "009-gone.md"), "plans/009-gone.md"),
  );
  assert.match(missing.warning ?? "", /not reachable/);
  const plain = { ...planTask("x", "x"), source: undefined } as Task;
  assert.deepEqual(await archivePlanFile(plain), {});
});
