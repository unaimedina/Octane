import { execFile } from "node:child_process";
import path from "node:path";
import type { NextRequest } from "next/server";
import { failure, guard, jsonBody, noStoreJson } from "@/lib/bff";
import { getPathInfo } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InstallBody = {
  action?: "scan" | "install";
  repo?: string;
  ref?: string;
  skills?: string[];
};

type InstallerResult = {
  ok?: boolean;
  error?: string;
  skills?: unknown;
  installed?: unknown;
};

async function resolveSkillsDir(): Promise<string | null> {
  const configured = process.env.OPENCODE_SKILLS_DIR?.trim();
  if (configured) return configured;
  const workspace = (await getPathInfo())?.directory;
  return workspace ? path.join(workspace, ".opencode", "skills") : null;
}

function runInstaller(payload: Record<string, unknown>): Promise<InstallerResult> {
  const script = path.join(process.cwd(), "scripts", "install-skill.mjs");
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [script],
      {
        timeout: 90_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        if (!stdout) {
          reject(
            new Error(
              stderr.trim() || error?.message || "Skill installer failed.",
            ),
          );
          return;
        }
        try {
          resolve(JSON.parse(stdout) as InstallerResult);
        } catch {
          reject(new Error("Skill installer returned invalid output."));
        }
      },
    );
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const body = await jsonBody<InstallBody>(request);
    const repo = body?.repo?.trim();
    if (!repo) {
      return noStoreJson(
        { error: "bad_request", message: "Repository URL is required." },
        400,
      );
    }

    if (body?.action === "scan") {
      const result = await runInstaller({
        action: "scan",
        repo,
        ref: body.ref,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Could not scan repository.");
      }
      return noStoreJson({
        skills: result.skills ?? [],
        destination: await resolveSkillsDir(),
      });
    }

    if (body?.action === "install") {
      const selected = Array.isArray(body.skills)
        ? body.skills.filter((value): value is string => typeof value === "string")
        : [];
      if (selected.length === 0) {
        return noStoreJson(
          { error: "bad_request", message: "Select at least one skill." },
          400,
        );
      }
      const skillsDir = await resolveSkillsDir();
      if (!skillsDir) {
        return noStoreJson(
          {
            error: "bad_request",
            message:
              "Set OPENCODE_SKILLS_DIR to a writable directory, or make the workspace available.",
          },
          400,
        );
      }
      const result = await runInstaller({
        action: "install",
        repo,
        ref: body.ref,
        skills: selected,
        skillsDir,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Could not install skills.");
      }
      return noStoreJson({
        installed: result.installed ?? [],
        destination: skillsDir,
      });
    }

    return noStoreJson(
      { error: "bad_request", message: "Unknown action." },
      400,
    );
  } catch (error) {
    return failure(error);
  }
}
