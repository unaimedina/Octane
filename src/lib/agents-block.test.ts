import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTEXT_BEGIN,
  CONTEXT_END,
  renderContextBlock,
  sanitizeContextFilename,
  upsertContextBlock,
} from "./agents-block.ts";

const files = [
  { name: "spec.md", size: 12 * 1024 },
  { name: "a.csv", size: 500 },
];

describe("sanitizeContextFilename", () => {
  it("rejects traversal without extension", () => {
    assert.equal(sanitizeContextFilename("../../etc/passwd"), null);
  });
  it("keeps only the basename for traversal with extension", () => {
    assert.equal(sanitizeContextFilename("../../x.md"), "x.md");
  });
  it("replaces unsafe characters", () => {
    const result = sanitizeContextFilename("My Spec (v2).md");
    assert.ok(result);
    assert.match(result, /^[A-Za-z0-9._-]+$/);
    assert.ok(result.endsWith(".md"));
  });
  it("rejects dotfiles and disallowed extensions", () => {
    assert.equal(sanitizeContextFilename(".env"), null);
    assert.equal(sanitizeContextFilename("a.exe"), null);
    assert.equal(sanitizeContextFilename(""), null);
  });
  it("is case-insensitive on extensions", () => {
    assert.equal(sanitizeContextFilename("PIC.PNG"), "PIC.PNG");
  });
  it("limits length to 120 and keeps the extension", () => {
    const result = sanitizeContextFilename(`${"a".repeat(300)}.md`);
    assert.ok(result);
    assert.ok(result.length <= 120);
    assert.ok(result.endsWith(".md"));
  });
});

describe("renderContextBlock", () => {
  it("is empty for no files", () => {
    assert.equal(renderContextBlock([]), "");
  });
  it("sorts and formats sizes", () => {
    const block = renderContextBlock(files);
    assert.ok(block.indexOf("a.csv") < block.indexOf("spec.md"));
    assert.ok(block.includes("(500 B)"));
    assert.ok(block.includes("(12 KB)"));
  });
});

describe("upsertContextBlock", () => {
  it("appends to an empty string", () => {
    const out = upsertContextBlock("", files);
    assert.ok(out.startsWith(CONTEXT_BEGIN));
    assert.ok(out.trimEnd().endsWith(CONTEXT_END));
  });
  it("appends after existing content with one blank line", () => {
    const out = upsertContextBlock("# Hi\n", files);
    assert.ok(out.startsWith(`# Hi\n\n${CONTEXT_BEGIN}`));
  });
  it("replaces an existing block and keeps outside content identical", () => {
    const original = "# Top\n\nuser text\n";
    const first = upsertContextBlock(original, files);
    const withTail = `${first}\nTail text\n`;
    const second = upsertContextBlock(withTail, [{ name: "z.md", size: 1 }]);
    assert.ok(second.startsWith("# Top\n\nuser text\n\n"));
    assert.ok(second.endsWith("\nTail text\n"));
    assert.ok(second.includes("z.md"));
    assert.ok(!second.includes("spec.md"));
    assert.equal(second.split(CONTEXT_BEGIN).length, 2);
  });
  it("removes the block when the list is empty", () => {
    const original = "# Top\n\nuser text\n";
    const withBlock = upsertContextBlock(original, files);
    assert.equal(upsertContextBlock(withBlock, []), original);
  });
  it("does nothing for no files and no block", () => {
    assert.equal(upsertContextBlock("abc", []), "abc");
  });
  it("preserves CRLF", () => {
    const out = upsertContextBlock("# Hi\r\n", files);
    assert.ok(!/(^|[^\r])\n/.test(out));
    assert.equal(upsertContextBlock(out, []), "# Hi\r\n");
  });
});
