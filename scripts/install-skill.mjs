import { execFile } from "node:child_process";
import {
  access,
  constants,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLONE_TIMEOUT_MS = 45_000;
const MAX_SKILLS = 50;
const MAX_DEPTH = 6;

function sanitizeId(value) {
  const id = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return id || "skill";
}

function validateRepo(repo) {
  const value = String(repo ?? "").trim();
  if (!value) throw new Error("Repository URL is required.");
  if (value.length > 500) throw new Error("Repository URL is too long.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Enter a valid repository URL, for example https://github.com/user/skills.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) repository URLs are supported.");
  }
  return value;
}

function validateRef(ref) {
  const value = String(ref ?? "").trim();
  if (!value) return undefined;
  if (
    value.length > 200 ||
    value.startsWith("-") ||
    !/^[A-Za-z0-9._/-]+$/.test(value)
  ) {
    throw new Error("Invalid branch or tag name.");
  }
  return value;
}

function repositoryName(repo) {
  try {
    const url = new URL(repo);
    const last = url.pathname.split("/").filter(Boolean).pop() ?? "skill";
    return last.replace(/\.git$/i, "");
  } catch {
    return "skill";
  }
}

function isPermissionError(error) {
  return Boolean(
    error && typeof error === "object" && (error.code === "EACCES" || error.code === "EPERM"),
  );
}

function permissionMessage(directory) {
  return `The web container cannot write to ${directory}. In Docker, make sure the shared "opencode-skills" volume is mounted and writable by UID 1001. Outside Docker, set OPENCODE_SKILLS_DIR to a writable directory or make the workspace writable.`;
}

async function ensureSkillsDirectory(directory) {
  try {
    await mkdir(directory, { recursive: true });
    await access(directory, constants.W_OK);
  } catch (error) {
    if (isPermissionError(error)) throw new Error(permissionMessage(directory));
    throw error;
  }
}

async function cloneRepository(repo, ref) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-skill-"));
  const args = ["clone", "--depth", "1", "--single-branch", "--no-tags"];
  if (ref) args.push("--branch", ref);
  args.push(repo, directory);
  try {
    await execFileAsync("git", args, {
      timeout: CLONE_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    throw new Error(
      stderr
        ? `Could not clone repository: ${stderr.slice(0, 400)}`
        : "Could not clone repository.",
    );
  }
}

function readFrontmatterValue(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter);
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") || undefined;
}

async function readSkillMetadata(file) {
  try {
    const content = await readFile(file, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? "";
    return {
      name: readFrontmatterValue(frontmatter, "name"),
      description: readFrontmatterValue(frontmatter, "description"),
    };
  } catch {
    return {};
  }
}

async function scanDirectory(root, directory, depth, rootId, usedIds, out) {
  if (out.length >= MAX_SKILLS || depth > MAX_DEPTH) return;
  const entries = await readdir(directory, { withFileTypes: true });
  const hasSkillFile = entries.some(
    (entry) => entry.isFile() && entry.name === "SKILL.md",
  );

  if (hasSkillFile) {
    const relative = path.relative(root, directory).replace(/\\/g, "/") || ".";
    const baseId = sanitizeId(relative === "." ? rootId : path.basename(directory));
    let id = baseId;
    for (let suffix = 2; usedIds.has(id); suffix += 1) {
      id = `${baseId}-${suffix}`;
    }
    usedIds.add(id);
    const metadata = await readSkillMetadata(path.join(directory, "SKILL.md"));
    out.push({
      id,
      name: metadata.name || id,
      description: metadata.description,
      path: relative,
    });
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    await scanDirectory(
      root,
      path.join(directory, entry.name),
      depth + 1,
      rootId,
      usedIds,
      out,
    );
  }
}

async function scanClone(root, repo) {
  const skills = [];
  await scanDirectory(
    root,
    root,
    0,
    sanitizeId(repositoryName(repo)),
    new Set(),
    skills,
  );
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function scanRepository(repo, ref) {
  const url = validateRepo(repo);
  const branch = validateRef(ref);
  const clone = await cloneRepository(url, branch);
  try {
    return await scanClone(clone, url);
  } finally {
    await rm(clone, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function installSkills(repo, ref, selectedPaths, skillsDir) {
  const url = validateRepo(repo);
  const branch = validateRef(ref);
  if (selectedPaths.length === 0) throw new Error("Select at least one skill.");

  const destinationRoot = String(skillsDir ?? "").trim();
  if (!destinationRoot) throw new Error("Skills destination is missing.");
  if (!path.isAbsolute(destinationRoot)) {
    throw new Error("Skills destination must be an absolute path.");
  }
  await ensureSkillsDirectory(destinationRoot);

  const clone = await cloneRepository(url, branch);
  try {
    const detected = await scanClone(clone, url);
    const byPath = new Map(detected.map((skill) => [skill.path, skill]));
    const skillsRoot = path.resolve(destinationRoot);
    const cloneRoot = clone;
    const installed = [];

    try {
      for (const relative of selectedPaths) {
        const skill = byPath.get(relative);
        if (!skill) continue;
        const source = path.join(cloneRoot, relative === "." ? "" : relative);
        if (source !== cloneRoot && !source.startsWith(`${cloneRoot}${path.sep}`)) {
          continue;
        }
        const destination = path.join(skillsRoot, skill.id);
        if (!destination.startsWith(`${skillsRoot}${path.sep}`)) continue;

        const temporary = path.join(
          skillsRoot,
          `.tmp-${skill.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        );
        await cp(source, temporary, {
          recursive: true,
          force: true,
          filter: (file) => {
            const base = path.basename(file);
            return base !== ".git" && base !== "node_modules";
          },
        });
        await rm(destination, { recursive: true, force: true });
        await rename(temporary, destination);
        installed.push(skill);
      }
    } catch (error) {
      if (isPermissionError(error)) {
        throw new Error(permissionMessage(destinationRoot));
      }
      throw error;
    }

    return installed;
  } finally {
    await rm(clone, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || "{}");
  if (input.action === "scan") {
    return { ok: true, skills: await scanRepository(input.repo, input.ref) };
  }
  if (input.action === "install") {
    const selected = Array.isArray(input.skills)
      ? input.skills.filter((value) => typeof value === "string")
      : [];
    return {
      ok: true,
      installed: await installSkills(
        input.repo,
        input.ref,
        selected,
        String(input.skillsDir ?? ""),
      ),
    };
  }
  throw new Error("Unknown action.");
}

main()
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
  })
  .catch((error) => {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error.",
      }),
    );
  });
