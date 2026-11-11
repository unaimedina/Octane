import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPath } from "./storage-check.ts";

const MOUNTINFO = [
  "1290 1180 0:310 / / rw,relatime master:500 - overlay overlay rw,lowerdir=/x,upperdir=/y,workdir=/z",
  "1291 1290 0:313 / /proc rw,nosuid,nodev,noexec,relatime - proc proc rw",
  "1300 1290 8:1 /var/lib/docker/volumes/opencode-users/_data /home/nextjs/.local/share/octane/users rw,relatime - ext4 /dev/sda1 rw",
  "1301 1290 8:1 /srv/workspace /workspace rw,relatime - ext4 /dev/sda1 rw",
  "1302 1290 8:1 /srv/my\\040dir /data\\040dir rw,relatime - ext4 /dev/sda1 rw",
].join("\n");

test("sibling volume does not make the data dir persistent", () => {
  assert.equal(classifyPath(MOUNTINFO, "/home/nextjs/.local/share/octane-data"), "ephemeral");
});

test("path inside a mounted volume is persistent", () => {
  assert.equal(
    classifyPath(MOUNTINFO, "/home/nextjs/.local/share/octane/users/abc"),
    "persistent",
  );
});

test("mount point itself and trailing slash", () => {
  assert.equal(classifyPath(MOUNTINFO, "/workspace"), "persistent");
  assert.equal(classifyPath(MOUNTINFO, "/workspace/"), "persistent");
});

test("prefix must end at a path separator", () => {
  assert.equal(classifyPath(MOUNTINFO, "/workspace2"), "ephemeral");
});

test("octal escapes are decoded", () => {
  assert.equal(classifyPath(MOUNTINFO, "/data dir/x"), "persistent");
});

test("non-overlay root is unknown", () => {
  const info = "1 0 8:1 / / rw - ext4 /dev/sda1 rw";
  assert.equal(classifyPath(info, "/home/u/data"), "unknown");
});

test("empty input and relative paths are unknown", () => {
  assert.equal(classifyPath("", "/anything"), "unknown");
  assert.equal(classifyPath(MOUNTINFO, "relative/path"), "unknown");
});

test("stacked mounts: the last one wins", () => {
  const info = [
    "1 0 0:1 / / rw - overlay overlay rw",
    "2 1 0:2 / /data rw - overlay overlay rw",
    "3 1 8:1 / /data rw - ext4 /dev/sda1 rw",
  ].join("\n");
  assert.equal(classifyPath(info, "/data/x"), "persistent");
});
