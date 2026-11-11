import { githubConfigured, githubScopes } from "./env";
import { publicOrigin } from "./discord";
import type { GithubRepo } from "./types";

const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

export class GithubError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "GithubError";
    this.status = status;
    this.code = code;
  }
}

export type GithubUser = {
  login: string;
  name?: string;
  avatarUrl?: string;
};

export function githubRedirectUri(request: Request): string {
  return (
    process.env.GITHUB_REDIRECT_URI?.trim() ||
    `${publicOrigin(request)}/api/github/callback`
  );
}

export function githubAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(GITHUB_AUTHORIZE);
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", githubScopes());
  url.searchParams.set("state", state);
  return url.toString();
}

async function githubFetch(
  path: string,
  init: RequestInit,
  failureMessage: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GithubError("GitHub could not be reached. Try again in a moment.");
  }
  if (!response.ok) {
    let message = failureMessage;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message) {
        message = body.message;
      }
    } catch {
      // non-JSON error body
    }
    if (response.status === 401 || response.status === 403) {
      throw new GithubError("GitHub authorization expired. Reconnect GitHub.", response.status, "reconnect_required");
    }
    throw new GithubError(message, response.status);
  }
  return response;
}

function apiHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "octane",
  };
}

export async function exchangeGithubCode(
  code: string,
  redirectUri: string,
): Promise<string> {
  if (!githubConfigured()) {
    throw new GithubError("GitHub is not configured.", undefined, "not_configured");
  }
  const body = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? "",
    client_secret: process.env.GITHUB_CLIENT_SECRET ?? "",
    code,
    redirect_uri: redirectUri,
  });

  let response: Response;
  try {
    response = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GithubError("GitHub could not be reached. Try again in a moment.");
  }

  const data = (await response.json().catch(() => null)) as
    | { access_token?: unknown; error?: unknown; error_description?: unknown }
    | null;
  if (!response.ok || typeof data?.access_token !== "string" || !data.access_token) {
    const description =
      typeof data?.error_description === "string"
        ? data.error_description
        : typeof data?.error === "string"
          ? data.error
          : "GitHub did not return an access token.";
    throw new GithubError(description, response.status);
  }
  return data.access_token;
}

export async function fetchGithubUser(token: string): Promise<GithubUser> {
  const response = await githubFetch(
    "/user",
    { headers: apiHeaders(token) },
    "GitHub did not return the signed-in account.",
  );
  const data = (await response.json().catch(() => null)) as
    | { login?: unknown; name?: unknown; avatar_url?: unknown }
    | null;
  if (typeof data?.login !== "string" || !data.login) {
    throw new GithubError("GitHub did not return an account login.");
  }
  return {
    login: data.login,
    name: typeof data.name === "string" && data.name ? data.name : undefined,
    avatarUrl:
      typeof data.avatar_url === "string" && data.avatar_url
        ? data.avatar_url
        : undefined,
  };
}

type RawRepo = {
  full_name?: unknown;
  name?: unknown;
  owner?: { login?: unknown } | null;
  html_url?: unknown;
  default_branch?: unknown;
  private?: unknown;
  description?: unknown;
  updated_at?: unknown;
};

function toRepo(value: unknown): GithubRepo | null {
  if (!value || typeof value !== "object") return null;
  const repo = value as RawRepo;
  const fullName = typeof repo.full_name === "string" ? repo.full_name : "";
  const name = typeof repo.name === "string" ? repo.name : "";
  const owner =
    repo.owner && typeof repo.owner.login === "string" ? repo.owner.login : "";
  const htmlUrl = typeof repo.html_url === "string" ? repo.html_url : "";
  if (!fullName || !name || !owner || !htmlUrl) return null;
  return {
    fullName,
    name,
    owner,
    htmlUrl,
    defaultBranch:
      typeof repo.default_branch === "string" ? repo.default_branch : "",
    private: repo.private === true,
    description:
      typeof repo.description === "string" && repo.description
        ? repo.description
        : undefined,
    updatedAt:
      typeof repo.updated_at === "string" && repo.updated_at
        ? repo.updated_at
        : undefined,
  };
}

export async function fetchGithubRepos(token: string): Promise<GithubRepo[]> {
  const response = await githubFetch(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    { headers: apiHeaders(token) },
    "GitHub could not list your repositories.",
  );
  const data = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) {
    throw new GithubError("GitHub returned an invalid repository list.");
  }
  return data
    .map(toRepo)
    .filter((repo): repo is GithubRepo => Boolean(repo));
}

/** Verify access to one repository and read its metadata. */
export async function fetchGithubRepo(
  token: string,
  repo: string,
): Promise<GithubRepo> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new GithubError("Use the owner/repository format.", 400);
  }
  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    { headers: apiHeaders(token) },
    "GitHub could not open that repository.",
  );
  const data = toRepo(await response.json().catch(() => null));
  if (!data) {
    throw new GithubError("GitHub returned an invalid repository.");
  }
  return data;
}
