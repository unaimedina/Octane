import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { fetchGithubRepos, GithubError } from "@/lib/github";
import { getGithubConnection } from "@/lib/github-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;

  try {
    const connection = await getGithubConnection(auth.session.subject);
    if (!connection) {
      return noStoreJson(
        { error: "github_not_connected", message: "Connect GitHub first." },
        409,
      );
    }

    const repos = await fetchGithubRepos(connection.token);
    const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const filtered = query
      ? repos.filter(
          (repo) =>
            repo.fullName.toLowerCase().includes(query) ||
            repo.description?.toLowerCase().includes(query),
        )
      : repos;
    return noStoreJson({ repos: filtered });
  } catch (error) {
    if (
      error instanceof GithubError &&
      (error.status === 401 || error.status === 403)
    ) {
      return noStoreJson(
        {
          error: "github_reconnect_required",
          message: "Reconnect GitHub.",
        },
        409,
      );
    }
    return failure(error);
  }
}
