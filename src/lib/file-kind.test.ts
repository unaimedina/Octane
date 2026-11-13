import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_BYTES, isTextFile, isTextLikeContentType } from "./file-kind.ts";

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decides(path: string, contentType: string, data: Uint8Array): boolean {
  return isTextFile({ path, contentType, bytes: data });
}

test("TypeScript source with OpenCode's video/mp2t type is text", () => {
  assert.equal(decides("src/a.ts", "video/mp2t", utf8("export const a = 1;\n")), true);
});

test("module variants of TypeScript with video/mp2t are text", () => {
  for (const path of ["b.mts", "d.d.ts"]) {
    assert.equal(decides(path, "video/mp2t", utf8("export const value = 1;\n")), true, path);
  }
});

test("source files typed as octet-stream are text", () => {
  const samples: Array<[string, string]> = [
    ["c.cts", "export const value = 1;\n"],
    ["e.tsx", "export function App() {\n  return <div />;\n}\n"],
    ["k.py", "def main():\n    return 1\n"],
    ["q.go", "package main\n\nfunc main() {}\n"],
    ["g.m4", "AC_PREREQ([2.69])\n"],
  ];
  for (const [path, source] of samples) {
    assert.equal(decides(path, "application/octet-stream", utf8(source)), true, path);
  }
});

test("extensionless config files typed as octet-stream are text", () => {
  const samples: Array<[string, string]> = [
    ["Dockerfile", "FROM node:22\nWORKDIR /app\n"],
    [".env", "AUTH_PASSWORD=secret\n"],
    [".env.local", "OPENCODE_SERVER_MODE=shared\n"],
    ["bun.lock", '{ "lockfileVersion": 1 }\n'],
    ["Makefile", "build:\n\tnext build\n"],
  ];
  for (const [path, text] of samples) {
    assert.equal(decides(path, "application/octet-stream", utf8(text)), true, path);
  }
});

test("SQL typed as application/sql is text", () => {
  assert.equal(decides("p.sql", "application/sql", utf8("select 1;\n")), true);
});

test("SVG typed as image/svg+xml is text", () => {
  assert.equal(
    decides("i.svg", "image/svg+xml", utf8('<svg xmlns="http://www.w3.org/2000/svg" />\n')),
    true,
  );
});

test("a real MPEG-TS named .ts stays binary", () => {
  const clip = new Uint8Array([0x47, 0x40, 0x00, 0x10, 0x00, 0x00, 0x47, 0x40, 0x11, 0x10]);
  assert.equal(decides("clip.ts", "video/mp2t", clip), false);
});

test("PNG bytes are binary even when the extension is not enough", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.equal(decides("l.png", "image/png", png), false);
});

test("known binary extensions decide before the bytes", () => {
  const plain = utf8("not actually binary\n");
  const samples: Array<[string, string]> = [
    ["m.pdf", "application/pdf"],
    ["n.zip", "application/zip"],
    ["v.mp4", "video/mp4"],
    ["font.woff2", "font/woff2"],
    ["bun.lockb", "application/octet-stream"],
  ];
  for (const [path, contentType] of samples) {
    assert.equal(decides(path, contentType, plain), false, path);
  }
});

test("a file without extension is sniffed as text", () => {
  assert.equal(decides("notes", "", utf8("héllo\n")), true);
});

test("a file without extension and invalid UTF-8 is binary", () => {
  assert.equal(decides("blob", "application/octet-stream", new Uint8Array([0xff, 0xfe, 0xfd])), false);
});

test("a sequence cut at the sample boundary still counts as text", () => {
  const head = new Uint8Array(SAMPLE_BYTES - 1).fill(0x61);
  const cutEuro = new Uint8Array([0xe2, 0x82]); // first two bytes of "€" (E2 82 AC)
  const bytes = new Uint8Array(head.length + cutEuro.length);
  bytes.set(head);
  bytes.set(cutEuro, head.length);
  assert.equal(bytes.length, SAMPLE_BYTES + 1);

  assert.equal(decides("big.txt", "text/plain", bytes), true);
  assert.equal(decides("big", "", bytes), true);
});

test("invalid UTF-8 in a known source extension is text anyway", () => {
  const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "caf\xe9"
  assert.equal(decides("latin1.py", "application/octet-stream", latin1), true);
});

test("text-like content types", () => {
  assert.equal(isTextLikeContentType("text/plain; charset=utf-8"), true);
  assert.equal(isTextLikeContentType("text/markdown"), true);
  assert.equal(isTextLikeContentType("application/json"), true);
  assert.equal(isTextLikeContentType("application/javascript"), true);
  assert.equal(isTextLikeContentType("image/svg+xml"), true);
  assert.equal(isTextLikeContentType("application/x-sh"), true);
  assert.equal(isTextLikeContentType("application/sql"), true);
  assert.equal(isTextLikeContentType("video/mp2t"), false);
  assert.equal(isTextLikeContentType("application/octet-stream"), false);
  assert.equal(isTextLikeContentType("image/png"), false);
  assert.equal(isTextLikeContentType(""), false);
});
