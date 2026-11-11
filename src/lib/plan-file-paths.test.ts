import { test } from "node:test";
import assert from "node:assert/strict";
import { diffTouchesPlanFiles, isPlanFilePath, partTouchesPlanFiles } from "./plan-file-paths.ts";

test("isPlanFilePath matches plan files and the index", () => {
  assert.ok(isPlanFilePath("plans/001-vehicle-integrations.md"));
  assert.ok(isPlanFilePath("/home/u/repo/plans/README.md"));
  assert.ok(isPlanFilePath(String.raw`C:\repo\plans\006-languages.md`));
  assert.ok(isPlanFilePath("/r/advisor-plans/004-compass.md"));
  assert.ok(!isPlanFilePath("src/plans-old/notes.md"));
  assert.ok(!isPlanFilePath("myplans/001-x.md"));
  assert.ok(!isPlanFilePath("plans/001-x.txt"));
  assert.ok(!isPlanFilePath("plans/001-x.md.bak"));
});

test("partTouchesPlanFiles only counts completed tool calls and patches", () => {
  const write = {
    type: "tool",
    tool: "write",
    state: { status: "completed", input: { filePath: "/r/plans/002-public-exports.md" } },
  };
  assert.ok(partTouchesPlanFiles(write));
  // A Windows path inside JSON is double-escaped.
  assert.ok(
    partTouchesPlanFiles({
      type: "tool",
      tool: "write",
      state: { status: "completed", input: { filePath: String.raw`D:\r\plans\003-hud.md` } },
    }),
  );
  assert.ok(!partTouchesPlanFiles({ ...write, state: { ...write.state, status: "running" } }));
  assert.ok(
    !partTouchesPlanFiles({
      type: "tool",
      tool: "read",
      state: { status: "completed", input: { filePath: "/r/src/a.ts" } },
    }),
  );
  assert.ok(partTouchesPlanFiles({ type: "patch", files: ["/r/plans/README.md"] }));
  assert.ok(!partTouchesPlanFiles({ type: "text" }));
});

test("diffTouchesPlanFiles", () => {
  assert.ok(diffTouchesPlanFiles([{ file: "src/a.ts" }, { file: "plans/003-hud.md" }]));
  assert.ok(!diffTouchesPlanFiles([{ file: "src/a.ts" }]));
});
