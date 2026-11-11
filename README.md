<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="OCTANE — a self-hosted, authenticated workspace for the OpenCode agent">
</p>

# OCTANE

A self-hosted, authenticated workspace for the [OpenCode](https://opencode.ai) agent. OCTANE keeps the agent server on a private network, puts a real login in front of it, and gives you the full workflow in a browser: live sessions, tool calls, diffs, tasks, shell and usage.

> Independent project. Not built by or affiliated with Anomaly.

<p align="center">
  <a href="./assets/readme/workspace.webp">
    <img src="./assets/readme/workspace-session.webp" width="100%" alt="A real OCTANE session showing reasoning, tool calls, a running write and the composer">
  </a>
</p>

<p align="center"><sub>A real OCTANE session: reasoning, tool calls, a running write and the composer. Click to open the full workspace.</sub></p>

## Quick start

Requires Docker with Compose v2.

> The bundled Compose file joins an external `traefik` network and ships with Traefik labels. Create the network once with `docker network create traefik`, or remove the `traefik` network entries and the `labels` block if you publish `WEB_PORT` directly.

```bash
cp .env.example .env
# set AUTH_SECRET and AUTH_PASSWORD (or Discord)
docker compose up -d --build
```

Open <http://localhost:3000> and sign in.

Minimum `.env`:

```dotenv
AUTH_SECRET=<32+ random characters>
AUTH_PASSWORD=<a long password>
WORKSPACE_PATH=./workspace
```

Generate `AUTH_SECRET` with `openssl rand -base64 32` or:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Compose starts two services:

| Service | Purpose |
| --- | --- |
| `web` | OCTANE: authenticates requests, starts one private OpenCode server per user, and proxies requests to it. |
| `skills-init` | One-shot job that prepares the shared skills and per-user data volumes for the web container. |

The web image embeds the `ghcr.io/anomalyco/opencode` binary pinned to a tested tag. Update it deliberately. To use one external server for everybody instead, set `OPENCODE_SERVER_MODE=shared` and point `OPENCODE_SERVER_URL` at it.

## What you get

- **Live sessions** — streaming text, reasoning, tool calls and subagent progress over SSE, with permission prompts (once / always / reject), optimistic sends, automatic reconnect, a 50-message working window with the full log one click away, and fork or summarize from the session menu.
- **A real workspace** — searchable sessions, a project file browser, GitHub-flavoured Markdown with copyable code blocks, changed-file review with `@pierre/diffs`, lazy diffs, copy-patch, and a root folder picker for new sessions.
- **Tasks, shell and slash commands** — persistent per-session tasks with a definition, an agent prompt, status and priority. Run a task, edit it, add one manually, or import the steps from the latest plan; then switch to `!` shell mode for terminal cards and insert the server's slash commands.
- **Context without a turn** — drop docs, logs, images, PDFs or another chat into a conversation as context, and attach skills to any prompt.
- **Models and providers, per user** — choose a model per session or set a default, pick an agent, and connect OpenCode Console or an Anthropic API key. Each signed-in user gets a private OpenCode server, so sessions and provider credentials never cross accounts.
- **Usage, locally estimated** — monthly cost, tokens and sessions, a model breakdown, optional budgets and a month-end forecast at `/usage`.
- **Auth built in** — password (scrypt) and/or Discord OAuth gated by a server role, with signed HttpOnly sessions, CSRF tokens and login rate limits.
- **Docker-first** — a standalone non-root image with the OpenCode CLI embedded, a health check, Compose stack for OCTANE, shared skills volume and a consistent git config.

## Architecture

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="OCTANE request path: browser to Next.js BFF to OpenCode server to workspace and models, with credentials kept server-side">
</p>

The browser never talks to OpenCode directly. Data requests go through same-origin `/api/*` handlers, and pages render on the server behind `requireSession`. Mutations verify the session and CSRF. Every upstream call is routed to the signed-in user's own OpenCode server by `src/lib/tenant.ts`; the browser never receives the per-user Basic-auth password or a provider token.

In the default `per-user` mode, `src/lib/user-servers.ts` starts `opencode serve` on demand with an isolated `HOME`/XDG directory per user, a random localhost port and a random Basic-auth password. Session metadata, Anthropic keys and OpenCode Console logins live in that directory. Data survives web restarts and is reused from `server.json`. `src/lib/oc-server.ts` probes `/api/info` for v2 and falls back to `/global/health` for v1, then normalizes sessions, messages, tools, approvals, files and SSE into one UI model. `src/lib/event-proxy.ts` handles the stream, and `src/lib/session-service.ts` is the OpenCode-only facade used by pages and route handlers.

Set `OPENCODE_SERVER_MODE=shared` to use one external server for every user instead. In that mode sessions and provider keys are shared, as in older OCTANE releases.

Subagents are matched to their child session by `parentID` and rendered as live cards. `Edit`, `Write` and `MultiEdit` calls become before/after diffs through `@pierre/diffs`; the raw JSON stays available under **Raw input**.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_URL` | no | `http://localhost:3000` | Public origin for absolute metadata and Open Graph/Twitter image URLs, e.g. `https://opencode.example.com`. |
| `AUTH_SECRET` | production | dev fallback | HS256 signing key for sessions. 32+ characters. Rotating it signs everyone out. |
| `AUTH_PASSWORD` | one of | — | Plaintext password for password sign-in. |
| `AUTH_PASSWORD_HASH` | one of | — | scrypt hash from `npm run hash-password`. Takes precedence over `AUTH_PASSWORD`. |
| `AUTH_USERNAME` | no | `opencode` | Display name for password sessions; fallback when a Discord profile has no name. |
| `AUTH_COOKIE_SECURE` | no | auto | `true`/`false` to force the Secure cookie flag. Inferred from `x-forwarded-proto` / the request URL when omitted. |
| `DISCORD_CLIENT_ID` | Discord | — | OAuth2 application client ID. |
| `DISCORD_CLIENT_SECRET` | Discord | — | OAuth2 application client secret. |
| `DISCORD_BOT_TOKEN` | Discord | — | Bot token used to read guild member roles. |
| `DISCORD_GUILD_ID` | Discord | — | Server where the role is checked. |
| `DISCORD_ROLE_ID` | Discord | — | Role required to sign in. |
| `DISCORD_REDIRECT_URI` | no | auto | Exact callback URL. Defaults to `<public-origin>/api/auth/discord/callback`. |
| `OPENCODE_SERVER_MODE` | no | `per-user` | `per-user` gives every signed-in user a private OpenCode server. `shared` uses one `OPENCODE_SERVER_URL` for everybody, including its sessions and credentials. |
| `OPENCODE_BIN` | per-user | `opencode` | CLI used to start per-user servers. Use an absolute path when it is not on `PATH`. |
| `OPENCODE_USERS_DIR` | per-user | `~/.local/share/octane/users` | Base folder for per-user OpenCode data. Each user gets a hashed subfolder with sessions, credentials and logs. |
| `OCTANE_DATA_DIR` | no | `~/.local/share/octane-data` | OCTANE-owned metadata, currently per-session tasks. Compose mounts the `octane-data` volume here. |
| `OPENCODE_WORKSPACE` | no | current folder | Working directory used by per-user servers. Compose sets `/workspace`. |
| `OPENCODE_START_TIMEOUT_MS` | no | `45000` | How long to wait for a new per-user server to answer `/api/info`. |
| `OPENCODE_SERVER_URL` | shared | `http://127.0.0.1:4096` | Upstream OpenCode server used only in `shared` mode. |
| `OPENCODE_SERVER_USERNAME` | no | `opencode` | Basic-auth username for the shared upstream. |
| `OPENCODE_SERVER_PASSWORD` | shared | — | Basic-auth password for the shared upstream. Per-user servers generate their own random passwords. |
| `OPENCODE_API_FLAVOR` | no | auto | Force `v1` or `v2` instead of probing. |
| `ANTHROPIC_API_KEY` | no | — | Shared-mode convenience only. Per-user servers do not inherit it; each user connects their own key in Settings. |
| `USAGE_ROLLING_BUDGET_USD` | no | — | Optional rolling 24h budget for the local Usage dashboard. |
| `USAGE_WEEKLY_BUDGET_USD` | no | — | Optional rolling 7-day budget. |
| `USAGE_MONTHLY_BUDGET_USD` | no | — | Optional monthly budget; enables percentages and the month-end forecast. |
| `WEB_PORT` | no | `3000` | Host port published by Compose. |
| `WORKSPACE_PATH` | no | `./workspace` | Host folder mounted at `/workspace` in the web container and its per-user OpenCode servers. |
| `OPENCODE_SKILLS_DIR` | no | volume path | Where OCTANE writes installed skills. Compose sets it to the shared volume. |

### Anthropic API key, per user

Open **Settings → Anthropic API key** on a v2 server and paste a key. In the default `per-user` mode, the request is routed to the signed-in user's private OpenCode server and the key is stored in that user's data directory. Other users cannot see or use it.

The Settings card uses the OpenCode v2 integration API:

```text
GET  /api/integration
GET  /api/integration/anthropic
POST /api/integration/anthropic/connect/key
```

After connecting, OpenCode discovers Claude models and lists them in the model picker. The same card can disconnect the credential. The key is stored on that user's OpenCode server and is never sent back to the browser.

Each user can also connect their own OpenCode Console account from **Settings → OpenCode account**. Because every user has a separate OpenCode data directory, Console logins and Anthropic keys do not overlap.

> Password sign-in is a single local identity: everyone who knows the password shares one OpenCode server. Use Discord sign-in when you need one isolated server per person.

### Session tasks

Each session has a persistent task list in the context panel. A task has a **definition** (shown in the list), its own **prompt** (sent to the agent when you press Run), a status and a priority. You can add tasks manually, edit any field, delete them, import the steps from the latest plan agent response, and toggle completion with the status icon.

Running a task sends the definition plus prompt to the build agent, marks it **in progress**, and marks it **completed** when the session becomes idle. A session error or an abort returns it to pending so it can be retried. Tasks are stored per user and session under `OCTANE_DATA_DIR/tasks`; they persist across restarts.


The chat landing page and `/usage` aggregate the cost and token totals reported by sessions created during the current month. Set `USAGE_ROLLING_BUDGET_USD`, `USAGE_WEEKLY_BUDGET_USD` and `USAGE_MONTHLY_BUDGET_USD` to turn those totals into limits and a month-end forecast. These are local estimates, not OpenCode Go billing; use the OpenCode Console for exact credits and limits.

### Docker notes

The web container mounts `WORKSPACE_PATH` at `/workspace` and shares it with every per-user OpenCode server it starts there. OCTANE uses it for file tools and the folder picker.

Skills installed from Settings live in the shared `opencode-skills` volume: OCTANE writes to `/home/nextjs/.config/opencode/skills`, and each per-user server gets that folder linked into its own config directory. The one-shot `skills-init` service prepares both the skills and `opencode-users` volumes for UID `1001` before the web container starts.

Per-user sessions and provider credentials live in the `opencode-users` volume at `/home/nextjs/.local/share/octane/users`. Back it up if you want to keep sessions and connected keys across a full volume reset. Removing it signs every user out of OpenCode Console and deletes their sessions and Anthropic keys.

Per-session tasks live in the `octane-data` volume at `/home/nextjs/.local/share/octane-data`. Back it up together with `opencode-users` and the workspace if you want to keep the task lists.

> Upgrading from a shared server: sessions and credentials in the old `opencode-data` volume are not copied into per-user directories. Users start with an empty session list and reconnect their Anthropic key or OpenCode Console account in Settings.

Each user who signs in gets a long-lived OpenCode process (reused across web restarts through `server.json`). Plan container memory for the number of active users; the processes are started on first use, not at boot.

Compose mounts `docker/gitconfig` into the web container. It sets a git identity, `safe.directory = *`, rebase autostash and the `diff3` conflict style, which avoids the usual `dubious ownership` and `please commit/stash` prompts. For real conflicts, use the merge icon in the Changes tab to ask the agent to resolve them.

Compose defaults `AUTH_COOKIE_SECURE` to `false`. If Traefik terminates TLS, set `AUTH_COOKIE_SECURE=true` in `.env` so session cookies carry the `Secure` flag.

Root folders chosen in the New chat screen must be absolute paths that exist **inside the web container**, such as `/workspace` or `/workspace/project` — not paths on the host. If a saved folder stops working, click **Reset** next to the folder path to return to OpenCode's default location.

## Local development

Requires Node.js 22.9+ (the `start` script uses `--env-file-if-exists`; the Docker image already runs Node 22) and the OpenCode CLI on `PATH` (v2.2.x is what Compose embeds).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Minimum `.env.local`:

```dotenv
AUTH_SECRET=dev-secret-at-least-32-characters-long
AUTH_PASSWORD=dev
OPENCODE_SERVER_MODE=per-user
OPENCODE_BIN=opencode
OPENCODE_USERS_DIR=./data/users
OCTANE_DATA_DIR=./data/octane
```

OCTANE starts one `opencode serve` process per signed-in user on first use. There is no separate server to run. To use a single external server instead, set `OPENCODE_SERVER_MODE=shared`, `OPENCODE_SERVER_URL=http://127.0.0.1:4096` and optionally `OPENCODE_SERVER_PASSWORD`, then start it yourself:

```bash
OPENCODE_SERVER_PASSWORD=optional-upstream-password opencode serve --port 4096
```

To test Discord locally, register `http://localhost:3000/api/auth/discord/callback` as a redirect in the Discord application.

## Sign-in setup

You can enable one or both methods. If neither a password nor Discord is configured, the login page fails closed with a configuration warning.

### Password sign-in

Set `AUTH_PASSWORD` to a long password, or preferably store a hash:

```bash
npm run hash-password -- "your password"
# => scrypt:16384:8:1:...
```

Put the result in `AUTH_PASSWORD_HASH` and leave `AUTH_PASSWORD` empty. The hash takes precedence when both are set.

### Discord sign-in

<details>
<summary>Discord OAuth setup</summary>

1. Create an application at <https://discord.com/developers/applications>.
2. Under **OAuth2 → Redirects**, add `<public-origin>/api/auth/discord/callback` (for local Docker: `http://localhost:3000/api/auth/discord/callback`). If the public URL differs from the request origin, set `DISCORD_REDIRECT_URI` to the exact value.
3. Under **Bot**, create the bot, invite it to your server and enable **Server Members Intent**. The bot only needs to read member roles.
4. Copy the application **Client ID**, **Client Secret** and bot **Token** into the env file.
5. Copy the **Server ID** and the **Role ID** that should grant access. Role IDs can be copied with developer mode enabled in Discord.

Discord is enabled only when all five values are present; otherwise the login page hides that option and password sign-in still works. OAuth state lives in a short-lived HttpOnly cookie, and the role check happens server-side with the bot token.

</details>

## Security notes

- **Sessions** are stateless HS256 JWTs in an `HttpOnly`, `SameSite=Lax` cookie, valid for 12 hours. Set `AUTH_COOKIE_SECURE=true` when serving over HTTPS; the proxy header is trusted for inference.
- **Password sign-in** verifies scrypt hashes in constant time. Prefer `AUTH_PASSWORD_HASH` over plaintext; both stay server-side.
- **Discord sign-in** uses the OAuth2 authorization-code flow with a short-lived `state` cookie. The bot token only reads the member's roles in the configured guild; the Discord access token is never persisted.
- **CSRF** uses a readable `oc_csrf` cookie plus the `x-oc-csrf` header on every mutation, with an origin check. Login attempts are rate-limited by client IP.
- **Rate limiting** is in-memory and therefore per instance. For a multi-replica deployment, put a shared limiter (Redis, WAF, ingress) in front or replace `src/lib/rate-limit.ts`.
- **CSP** is `default-src 'self'` with the inline styles/scripts Next.js requires. There are no third-party scripts, analytics or external fonts at runtime.
- **Reverse proxy** is recommended for TLS, payload limits and slow-connection protection. Forward `x-forwarded-proto` so cookies get the `Secure` flag automatically.
- **Not a sandbox** — the agent can edit the mounted workspace and run tools. Run it in a container with a dedicated workspace; do not mount your home directory.
- **Per-user isolation** — in the default mode each user's OpenCode server runs with its own `HOME`/XDG data directory, on `127.0.0.1` with a random Basic-auth password generated for that process. Sessions, Anthropic keys and OpenCode Console logins are stored in that directory. The shared workspace is still shared: users can read and edit the same files.
- **Shared container boundary** — every per-user server runs as the same container user. The separation is logical, not a security sandbox: an agent with shell access could read another user's data directory or local server password. Use OCTANE with people you trust, or run one container per user if tenants are hostile.
- **Upstream credentials** live only in the server process. Do not add `NEXT_PUBLIC_*` secrets.

## Useful commands

```bash
npm run dev          # local development
npm run build        # production build (regenerates icons first)
npm run start        # run the production server
npm run typecheck    # TypeScript only
npm run lint         # ESLint
npm run icons        # regenerate app icons from ./assets
npm run hash-password -- "password"
```

## Project layout

```text
assets/                    source logos (icon.png, logo.png, minimal.png)
scripts/generate-icons.mjs builds favicons/app icons/manifest icons from assets
src/app/(app)/             authenticated workspace (chat, files, settings, usage)
src/app/login/             login screen
src/app/api/auth/          password login, Discord OAuth, logout, session
src/app/api/sessions/      session CRUD + prompt/command/shell/abort/fork/summarize/permissions + tasks
src/app/api/files/         directory listing, content, search, VCS status
src/app/api/events/        authenticated SSE proxy / v2 translator
src/app/api/integrations/  OpenCode account and provider connections
src/app/api/skills/        skill discovery and installation
src/components/chat/       chat, composer, markdown, diff, tools, context panel
src/components/usage/      usage dashboard and charts
src/lib/auth.ts            password verification + JWT sessions + CSRF helpers
src/lib/discord.ts         OAuth2 exchange + bot role check
src/lib/harness.ts         OpenCode label helpers
src/lib/session-service.ts OpenCode session facade
src/lib/tasks.ts          per-user, per-session task store
src/lib/tenant.ts          per-request routing to the signed-in user's server
src/lib/user-servers.ts    isolated OpenCode processes (spawn, reuse, logs)
src/lib/integrations.ts    OpenCode `/connect` integrations (Anthropic key/OAuth)
src/lib/oc-server.ts       v1/v2 upstream adapter
src/lib/event-proxy.ts     v1 pass-through / v2 event translation
src/lib/usage.ts           local usage aggregation and budgets
src/lib/bff.ts             route auth, CSRF and error helpers
```

## License

MIT. See the OpenCode project for its own license and trademarks.
