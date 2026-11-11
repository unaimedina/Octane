import { test } from "node:test";
import assert from "node:assert/strict";
import { parentPath, pathSegments, resolveAgainst } from "./folder-paths.ts";

test("relative bracketed path is joined onto the workspace", () => {
  assert.equal(
    resolveAgainst("/workspace", "home/docker/fivem/resources/[addons]/[voltic]"),
    "/workspace/home/docker/fivem/resources/[addons]/[voltic]",
  );
});

test("absolute and empty values", () => {
  assert.equal(resolveAgainst("/workspace", "/srv/x/"), "/srv/x");
  assert.equal(resolveAgainst("/workspace", ""), "/workspace");
  assert.equal(resolveAgainst("", "rel"), "");
});

test("dot-dot segments never go above the root", () => {
  assert.equal(resolveAgainst("/workspace/a", "../b"), "/workspace/b");
  assert.equal(resolveAgainst("/workspace", "../../x"), "/x");
});

test("windows paths", () => {
  assert.equal(resolveAgainst("C:/proj", "sub"), "C:/proj/sub");
  assert.equal(resolveAgainst("/workspace", "C:\\x\\"), "C:/x");
});

test("parentPath", () => {
  assert.equal(parentPath("/workspace/a"), "/workspace");
  assert.equal(parentPath("/workspace"), "/");
  assert.equal(parentPath("/"), "/");
  assert.equal(parentPath("C:/x"), "C:/");
});

test("pathSegments", () => {
  assert.deepEqual(pathSegments("/workspace/a"), [
    { label: "/", path: "/" },
    { label: "workspace", path: "/workspace" },
    { label: "a", path: "/workspace/a" },
  ]);
  assert.deepEqual(pathSegments("/"), [{ label: "/", path: "/" }]);
  assert.deepEqual(pathSegments("C:/x"), [
    { label: "C:", path: "C:/" },
    { label: "x", path: "C:/x" },
  ]);
});
