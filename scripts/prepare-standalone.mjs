/**
 * `output: "standalone"` produces .next/standalone/server.js but does not copy
 * static assets or public/. Docker copies them explicitly; this script makes
 * `npm start` work locally too.
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("Standalone server not found. Run `next build` first.");
  process.exit(1);
}

await mkdir(join(standalone, ".next"), { recursive: true });
await cp(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
  force: true,
});

if (existsSync(join(root, "public"))) {
  await cp(join(root, "public"), join(standalone, "public"), {
    recursive: true,
    force: true,
  });
}

// The skill installer runs as a child process so Next does not trace its
// dynamic filesystem access into the standalone bundle.
const skillInstaller = join(root, "scripts", "install-skill.mjs");
if (existsSync(skillInstaller)) {
  await mkdir(join(standalone, "scripts"), { recursive: true });
  await cp(skillInstaller, join(standalone, "scripts", "install-skill.mjs"), {
    force: true,
  });
}

// Never ship source files, env files or build tooling with the standalone
// runtime. This also removes anything a dynamic trace may have pulled in.
const keepAtRoot = new Set([
  ".next",
  "node_modules",
  "public",
  "scripts",
  "package.json",
  "server.js",
]);
for (const entry of await readdir(standalone, { withFileTypes: true })) {
  if (!keepAtRoot.has(entry.name)) {
    await rm(join(standalone, entry.name), { recursive: true, force: true });
  }
}

const standaloneScripts = join(standalone, "scripts");
if (existsSync(standaloneScripts)) {
  for (const entry of await readdir(standaloneScripts, { withFileTypes: true })) {
    if (entry.name !== "install-skill.mjs") {
      await rm(join(standaloneScripts, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }
}

console.log("Prepared .next/standalone for `npm start`.");
