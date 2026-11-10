"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { BrandLogo } from "@/components/brand";

type Health = {
  authConfigured: boolean;
  upstream: {
    mode?: "shared" | "per-user";
    reachable: boolean;
    healthy: boolean;
    version: string | null;
    unauthorized: boolean;
    status: number | null;
  };
};

const ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    "Authentication is not configured on this deployment. Set the Discord environment variables or AUTH_PASSWORD/AUTH_PASSWORD_HASH and restart the server.",
  access_denied: "You cancelled the Discord authorization. Try again when you are ready.",
  state_mismatch: "The sign-in attempt expired or was tampered with. Start again.",
  role_required:
    "Your Discord account is in the server but does not have the required role.",
  not_member: "Join the Discord server before signing in.",
  guild_not_found:
    "The Discord bot is not in the configured server, or DISCORD_GUILD_ID is wrong. Invite the bot to that server and try again.",
  bot_error:
    "The Discord bot could not read your roles. Check that it is in the server and has the Server Members intent enabled.",
  discord_error: "Discord did not answer correctly. Try again in a moment.",
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
};

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.26a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.61-1.26.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.04.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.3a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.07 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.3a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42Z" />
    </svg>
  );
}

export function LoginForm({
  next,
  discordEnabled,
  passwordEnabled,
  initialError,
}: {
  next: string;
  discordEnabled: boolean;
  passwordEnabled: boolean;
  initialError: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [visible, setVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    initialError ? ERROR_MESSAGES[initialError] ?? "Sign in failed." : null,
  );
  const [health, setHealth] = React.useState<Health | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (passwordEnabled) inputRef.current?.focus();
    fetch("/api/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Health | null) => setHealth(data))
      .catch(() => setHealth(null));
  }, [passwordEnabled]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(
          data.message ??
            (data.error === "rate_limited"
              ? "Too many attempts. Wait a few minutes and try again."
              : "Sign in failed."),
        );
        setPassword("");
        inputRef.current?.focus();
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Could not reach the web client. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const runtimeReady = Boolean(
    health?.upstream.reachable && health.upstream.healthy,
  );
  const discordHref = `/api/auth/discord/start?next=${encodeURIComponent(next)}`;

  return (
    <main
      className="dark relative min-h-dvh overflow-x-hidden bg-background text-foreground"
      style={{
        backgroundImage:
          "radial-gradient(900px 540px at 50% -14%, color-mix(in oklab, var(--brand) 10%, transparent), transparent 72%), radial-gradient(760px 520px at 100% 108%, color-mix(in oklab, var(--info) 6%, transparent), transparent 72%)",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col px-5 sm:px-8">
        <header className="flex h-16 shrink-0 items-center border-b border-border/60">
          <BrandLogo />
        </header>

        <div className="grid min-w-0 flex-1 items-center gap-12 py-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:py-16">
          <section className="order-2 min-w-0 max-w-[680px] lg:order-1">
            <h1 className="text-balance text-[clamp(2.15rem,4.2vw,3.25rem)] font-semibold leading-[1.07] tracking-[-0.045em]">
              Self-hosted AI coding
              <br />
              <span className="text-muted-foreground">workspace for OpenCode.</span>
            </h1>

            <p className="mt-6 max-w-[560px] text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Secure authentication, live AI sessions, file management, code diffs,
              terminal access, task management and usage tracking. Docker-ready, with
              a private environment for each user.
            </p>
          </section>

          <section className="order-1 min-w-0 w-full max-w-[460px] justify-self-start lg:order-2 lg:justify-self-end">
            <div className="glass-float relative rounded-2xl p-6 sm:p-8">
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">Sign in</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {passwordEnabled && discordEnabled
                  ? "Use your password or continue with Discord."
                  : passwordEnabled
                    ? "Enter the password configured for this deployment."
                    : discordEnabled
                      ? "Use your Discord account. Access requires the configured role in the server."
                      : "Authentication is not configured for this deployment."}
              </p>

              <div className="mt-6 space-y-4">
                {error ? (
                  <div
                    id="login-error"
                    role="alert"
                    className="flex items-start gap-2.5 rounded-[10px] border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-[13px] text-destructive"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {!passwordEnabled && !discordEnabled ? (
                  <div className="flex items-start gap-2.5 rounded-[10px] border border-warning/30 bg-warning/8 px-3 py-2.5 text-[13px] text-warning">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Set <code className="font-mono text-xs">AUTH_PASSWORD</code> or{" "}
                      <code className="font-mono text-xs">AUTH_PASSWORD_HASH</code> for
                      password sign-in, or configure the{" "}
                      <code className="font-mono text-xs">DISCORD_*</code> variables.
                    </span>
                  </div>
                ) : null}

                {health?.upstream.unauthorized ? (
                  <div className="flex items-start gap-2.5 rounded-[10px] border border-warning/30 bg-warning/8 px-3 py-2.5 text-[13px] text-warning">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      The OpenCode server rejected the configured credentials. Check{" "}
                      <code className="font-mono text-xs">OPENCODE_SERVER_PASSWORD</code>{" "}
                      and restart the server with the same value.
                    </span>
                  </div>
                ) : null}

                {health?.upstream.mode === "per-user" && !runtimeReady ? (
                  <div className="flex items-start gap-2.5 rounded-[10px] border border-warning/30 bg-warning/8 px-3 py-2.5 text-[13px] text-warning">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      The OpenCode CLI is not available. Install it or set{" "}
                      <code className="font-mono text-xs">OPENCODE_BIN</code> to its
                      path so each user can get a private server after signing in.
                    </span>
                  </div>
                ) : null}

                {passwordEnabled ? (
                  <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="password"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          ref={inputRef}
                          id="password"
                          name="password"
                          type={visible ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••••••"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          disabled={loading}
                          className="h-11 w-full rounded-[10px] border border-border/70 bg-card/40 px-3.5 pr-11 text-[14px] text-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/40 focus:border-brand/60 focus:bg-card/50 focus:ring-1 focus:ring-brand/20 disabled:opacity-50"
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? "login-error" : undefined}
                        />
                        <button
                          type="button"
                          onClick={() => setVisible((value) => !value)}
                          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                          aria-label={visible ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          {visible ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !password}
                      className="group inline-flex h-11 w-full items-center justify-between rounded-[10px] bg-brand px-5 text-[14px] font-semibold tracking-[-0.01em] text-brand-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_40px_-22px_rgba(255,138,0,0.8)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-brand/90 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <span className="flex items-center gap-2">
                        {loading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {loading ? "Verifying…" : "Continue to workspace"}
                      </span>
                      {!loading ? (
                        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      ) : null}
                    </button>
                  </form>
                ) : null}

                {passwordEnabled && discordEnabled ? (
                  <div className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-border/60" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
                      or
                    </span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                ) : null}

                {discordEnabled ? (
                  <a
                    href={discordHref}
                    className="group inline-flex h-11 w-full items-center justify-between rounded-[10px] border border-border/70 bg-card/40 px-5 text-[14px] font-medium tracking-[-0.01em] text-foreground transition-[background-color,border-color] duration-200 hover:border-foreground/20 hover:bg-muted/60"
                  >
                    <span className="flex items-center gap-2.5">
                      <DiscordIcon className="size-[18px]" />
                      Continue with Discord
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <footer className="shrink-0 py-4 text-center text-[10px] text-muted-foreground/50">
          Not affiliated with Anomaly.
        </footer>
      </div>
    </main>
  );
}
