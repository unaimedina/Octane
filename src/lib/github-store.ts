import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { authSecret, githubConfigured, octaneDataDir } from "./env";
import { fetchGithubRepo } from "./github";
import type { GithubStatus, ProjectGithubLink } from "./types";
import { userKey } from "./user-key";

const STORE_VERSION = 1;
const TOKEN_ALGORITHM = "aes-256-gcm";
const TOKEN_KEY_LABEL = "octane-github-token";

export type GithubConnection = {
  login: string;
  name?: string;
  avatarUrl?: string;
  token: string;
  connectedAt: number;
};

export type GithubConnectionInput = {
  login: string;
  name?: string;
  avatarUrl?: string;
  token: string;
};

type StoredConnection = {
  version: number;
  login: string;
  name?: string;
  avatarUrl?: string;
  token: string;
  connectedAt: number;
};

function tokenKey(): Buffer {
  return createHash("sha256")
    .update(Buffer.from(authSecret()))
    .update(TOKEN_KEY_LABEL)
    .digest();
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(TOKEN_ALGORITHM, tokenKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptToken(value: string): string {
  const [ivPart, tagPart, ciphertextPart] = value.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted GitHub token.");
  }
  const decipher = createDecipheriv(
    TOKEN_ALGORITHM,
    tokenKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function githubDir(): string {
  return path.join(octaneDataDir(), "github");
}

function connectionPath(subject: string): string {
  return path.join(githubDir(), `${userKey(subject)}.json`);
}

async function writeConnection(
  subject: string,
  stored: StoredConnection,
): Promise<void> {
  await fs.mkdir(githubDir(), { recursive: true, mode: 0o700 });
  const file = connectionPath(subject);
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(stored, null, 2), { mode: 0o600 });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EEXIST") throw error;
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
  }
}

export async function getGithubConnection(
  subject: string,
): Promise<GithubConnection | null> {
  let text: string;
  try {
    text = await fs.readFile(connectionPath(subject), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let parsed: StoredConnection;
  try {
    parsed = JSON.parse(text) as StoredConnection;
  } catch {
    throw new Error(
      "The GitHub connection file is not valid JSON. Reconnect GitHub to replace it.",
    );
  }
  if (parsed?.version !== STORE_VERSION || typeof parsed.token !== "string") {
    throw new Error("Unsupported GitHub connection file.");
  }

  let token: string;
  try {
    token = decryptToken(parsed.token);
  } catch {
    // AUTH_SECRET was rotated or the file was tampered with. Treat the
    // connection as absent; reconnecting overwrites it.
    return null;
  }

  return {
    login: parsed.login,
    name: parsed.name,
    avatarUrl: parsed.avatarUrl,
    token,
    connectedAt: parsed.connectedAt,
  };
}

export async function saveGithubConnection(
  subject: string,
  input: GithubConnectionInput,
): Promise<void> {
  await writeConnection(subject, {
    version: STORE_VERSION,
    login: input.login,
    ...(input.name ? { name: input.name } : {}),
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    token: encryptToken(input.token),
    connectedAt: Date.now(),
  });
}

export async function deleteGithubConnection(subject: string): Promise<void> {
  await fs.rm(connectionPath(subject), { force: true });
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export type GithubLinkResolution =
  | { ok: true; link: ProjectGithubLink }
  | {
      ok: false;
      error:
        | "bad_request"
        | "github_not_connected"
        | "github_reconnect_required";
      message: string;
    };

/**
 * Resolve and verify a repository link for a project. An unchanged link is
 * returned untouched so editing a project does not require GitHub access.
 */
export async function resolveProjectGithubLink(
  subject: string,
  repo: string,
  current?: ProjectGithubLink,
): Promise<GithubLinkResolution> {
  const clean = repo.trim();
  if (current && current.repo.toLowerCase() === clean.toLowerCase()) {
    return { ok: true, link: current };
  }
  if (!REPO_PATTERN.test(clean)) {
    return {
      ok: false,
      error: "bad_request",
      message: "Use the owner/repository format.",
    };
  }
  const connection = await getGithubConnection(subject);
  if (!connection) {
    return {
      ok: false,
      error: "github_not_connected",
      message: "Connect GitHub first.",
    };
  }
  try {
    const data = await fetchGithubRepo(connection.token, clean);
    return {
      ok: true,
      link: {
        repo: data.fullName,
        url: data.htmlUrl,
        defaultBranch: data.defaultBranch || undefined,
        private: data.private,
        description: data.description,
        linkedAt: Date.now(),
      },
    };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        error: "github_reconnect_required",
        message: "Reconnect GitHub.",
      };
    }
    if (status === 404) {
      return {
        ok: false,
        error: "bad_request",
        message: "GitHub could not find that repository or your account cannot access it.",
      };
    }
    throw error;
  }
}

export async function getGithubStatus(subject: string): Promise<GithubStatus> {
  const configured = githubConfigured();
  try {
    const connection = await getGithubConnection(subject);
    if (!connection) return { configured, connected: false };
    return {
      configured,
      connected: true,
      login: connection.login,
      ...(connection.avatarUrl ? { avatarUrl: connection.avatarUrl } : {}),
    };
  } catch {
    console.error("[github] connection metadata is unreadable; reconnect required");
    return { configured, connected: false };
  }
}
