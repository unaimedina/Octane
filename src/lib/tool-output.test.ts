import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGlobOutput,
  parseGrepOutput,
  parseReadOutput,
  patchStats,
  shortPath,
} from "./tool-output.ts";

test("read: v2 output with header", () => {
  const out = parseReadOutput(
    String.raw`Read file D:\repo\.env.example, lines 24-53` + "\n24: # Must match\n25: DISCORD_X=1\n26: ",
  );
  assert.ok(out);
  assert.equal(out.file, String.raw`D:\repo\.env.example`);
  assert.equal(out.startLine, 24);
  assert.equal(out.endLine, 53);
  assert.deepEqual(out.lines.map((l) => l.text), ["# Must match", "DISCORD_X=1", ""]);
});

test("read: old format with file tags", () => {
  const out = parseReadOutput("<file>\n00012| x\n00013| y\n</file>");
  assert.ok(out);
  assert.equal(out.startLine, 12);
  assert.deepEqual(out.lines, [{ n: 12, text: "x" }, { n: 13, text: "y" }]);
});

test("read: garbage returns null", () => {
  assert.equal(parseReadOutput("nothing here"), null);
  assert.equal(parseReadOutput(""), null);
});

test("grep: two matches with CRLF", () => {
  const out = parseGrepOutput(
    String.raw`Found 2 matches` + "\n" + String.raw`D:\repo\src\lib\user-servers.ts:` +
      "\n  Line 83: export function userKey(\r\n\n  Line 519:   const key = userKey(subject);\r\n",
  );
  assert.ok(out);
  assert.equal(out.total, 2);
  assert.equal(out.files.length, 1);
  assert.deepEqual(out.files[0].matches.map((m) => m.line), [83, 519]);
  assert.ok(out.files[0].matches.every((m) => !m.text.includes("\r")));
});

test("grep: multiple files", () => {
  const out = parseGrepOutput("Found 2 matches\n/a/b.ts:\n  Line 1: x\n/a/c.ts:\n  Line 2: y");
  assert.ok(out);
  assert.equal(out.files.length, 2);
  assert.equal(out.files[1].file, "/a/c.ts");
});

test("grep: no files found", () => {
  assert.deepEqual(parseGrepOutput("No files found"), { total: 0, files: [] });
  assert.equal(parseGrepOutput("random"), null);
});

test("glob: skips blanks and truncation note", () => {
  assert.deepEqual(parseGlobOutput("/a/x.ts\n\n/a/y.ts\r\n(Results are truncated: showing first 100)"), [
    "/a/x.ts",
    "/a/y.ts",
  ]);
});

test("patchStats ignores header lines", () => {
  const patch =
    "Index: .env.example\n====\n--- .env.example\n+++ .env.example\n@@ -27,9 +27,9 @@\n ctx\n-old\n+new\n+more";
  assert.deepEqual(patchStats(patch), { additions: 2, deletions: 1 });
});

test("shortPath", () => {
  assert.equal(shortPath(String.raw`D:\repo\src\lib\x.ts`, "D:/repo"), "src/lib/x.ts");
  assert.equal(shortPath(String.raw`d:\Repo\src\x.ts`, "D:/repo"), "src/x.ts");
  assert.equal(shortPath("/workspace/app/a.ts", "/workspace/app"), "a.ts");
  assert.equal(shortPath("/workspace/app", "/workspace/app"), ".");
  assert.equal(shortPath("/other/place/b.ts", "/workspace/app"), "place/b.ts");
  assert.equal(shortPath("/one/two/three.ts"), "two/three.ts");
  assert.equal(shortPath("single"), "single");
  assert.equal(shortPath(""), "");
});
