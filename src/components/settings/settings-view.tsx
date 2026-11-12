"use client";

import * as React from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { Wordmark } from "@/components/brand";
import {
  ModelPicker,
  findModel,
  type ModelSelection,
} from "@/components/model-picker";
import { AnthropicConnectCard } from "@/components/settings/anthropic-connect";
import { OpenCodeAccountCard } from "@/components/settings/opencode-account";
import { SkillInstaller } from "@/components/settings/skill-installer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSoundsEnabled, playSound, setSoundsEnabled, unlockAudio } from "@/lib/sounds";
import { readCsrfCookie } from "@/lib/api";
import { CSRF_HEADER } from "@/lib/constants";
import type {
  HealthInfo,
  OpenCodeIntegration,
  Path,
  ProviderIntegration,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ProviderRow = {
  id: string;
  name: string;
  connected: boolean;
  models: number;
};

type SafeConfig = {
  theme: string | null;
  model: string | null;
  smallModel: string | null;
  autoupdate: unknown;
  share: unknown;
  pluginCount: number;
  mcpCount: number;
} | null;

function normalizeStatuses(value: unknown): Array<{ name: string; status: string }> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        name:
          (typeof record.name === "string" && record.name) ||
          (typeof record.id === "string" && record.id) ||
          `item ${index + 1}`,
        status:
          (typeof record.status === "string" && record.status) ||
          (record.connected === true ? "connected" : "idle"),
      };
    });
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([name, item]) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        name,
        status:
          (typeof record.status === "string" && record.status) ||
          (typeof item === "string" ? item : "unknown"),
      };
    });
  }
  return [];
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[11px]">{value}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() =>
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            })
          }
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </Button>
      </div>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn("status-square", ok ? "bg-success" : "bg-warning")}
      aria-hidden="true"
    />
  );
}

/** Page-layout section (plan 018): hairline-separated, sentence-case title, no card. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 border-t border-border py-6 first:border-t-0 first:pt-0"
    >
      <h2 className="text-[13px] font-medium">{title}</h2>
      {description ? (
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}

function KeyValues({ rows, className }: { rows: Array<[string, string]>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs", className)}>
      {rows.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="truncate font-mono">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function SettingsView({
  health,
  pathInfo,
  serverUrl,
  serverMode,
  providers,
  config,
  mcp,
  lsp,
  formatter,
  integration,
  anthropicIntegration,
  integrationsAvailable,
  authMethod,
  sessionHours,
}: {
  health: HealthInfo | null;
  pathInfo: Path | null;
  serverUrl: string;
  serverMode: "shared" | "per-user";
  providers: ProviderRow[];
  config: SafeConfig;
  mcp: Record<string, unknown>;
  lsp: unknown[];
  formatter: unknown[];
  integration: OpenCodeIntegration | null;
  anthropicIntegration: ProviderIntegration | null;
  integrationsAvailable: boolean;
  authMethod: string;
  sessionHours: number;
}) {
  const { theme, setTheme } = useTheme();
  const { models, defaultModel, skills } = useAppData();
  const [selectedDefaultModel, setSelectedDefaultModel] =
    React.useState<ModelSelection | null>(defaultModel);
  const [renewing, setRenewing] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const [soundsOn, setSoundsOn] = React.useState(true);

  React.useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => setSoundsOn(getSoundsEnabled()));
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem("oc.defaultModel");
        if (!saved) return;
        const parsed = JSON.parse(saved) as ModelSelection;
        if (findModel(models, parsed)) {
          setSelectedDefaultModel(parsed);
        }
      } catch {
        // ignore malformed storage
      }
    });
  }, [models]);

  function changeDefaultModel(next: ModelSelection | null) {
    setSelectedDefaultModel(next);
    try {
      if (next) {
        window.localStorage.setItem("oc.defaultModel", JSON.stringify(next));
      } else {
        window.localStorage.removeItem("oc.defaultModel");
      }
      toast.success("Default model updated");
    } catch {
      toast.error("Could not save the default model");
    }
  }
  const mcpStatuses = normalizeStatuses(mcp);
  const lspStatuses = normalizeStatuses(lsp);
  const formatterStatuses = normalizeStatuses(formatter);
  const connectedProviders = providers.filter((provider) => provider.connected);

  async function renewSession() {
    setRenewing(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { [CSRF_HEADER]: readCsrfCookie() ?? "" },
      });
      if (!response.ok) throw new Error("Could not renew the session");
      toast.success("Session renewed", {
        description: `Signed in for another ${sessionHours} hours.`,
      });
    } catch (error) {
      toast.error("Session renewal failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRenewing(false);
    }
  }

  function signOut() {
    void fetch("/api/auth/logout", {
      method: "POST",
      headers: { [CSRF_HEADER]: readCsrfCookie() ?? "" },
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    }).finally(() => window.location.assign("/login"));
  }

  const index: Array<{ group: string; items: Array<[string, string]> }> = [
    {
      group: "Preferences",
      items: [
        ["appearance", "Appearance"],
        ["notifications", "Notifications"],
        ["shortcuts", "Shortcuts"],
      ],
    },
    {
      group: "Models & agents",
      items: [
        ["default-model", "Default model"],
        ["providers", "Providers"],
        ["skills", "Skills"],
        ["integrations", "Integrations"],
      ],
    },
    {
      group: "Accounts",
      items: [
        ["opencode-account", "OpenCode account"],
        ["anthropic", "Anthropic API key"],
      ],
    },
    {
      group: "Server",
      items: [
        ["server", "Your server"],
        ["workspace", "Workspace"],
        ["runtime", "Runtime"],
        ["security", "Security"],
        ["about", "About"],
      ],
    },
  ];

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="headline text-[26px] leading-tight">Settings</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Connection, security and workspace details for this deployment.
            </p>
          </div>
          <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <StatusDot ok={Boolean(health?.healthy)} />
            {health?.healthy ? `OpenCode ${health.version}` : "Server unreachable"}
          </span>
        </div>

        <div className="lg:flex lg:gap-10">
          <nav
            aria-label="Settings sections"
            className="hidden shrink-0 self-start lg:sticky lg:top-6 lg:block lg:w-44"
          >
            {index.map((group) => (
              <div key={group.group} className="mb-4">
                <div className="mb-1 text-[11px] text-muted-foreground/70">{group.group}</div>
                <ul className="space-y-0.5">
                  {group.items.map(([id, label]) => (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className="block rounded-sm py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            <Section id="appearance" title="Appearance" description="Theme is stored in this browser.">
              <div
                role="radiogroup"
                aria-label="Theme"
                className="inline-flex rounded-md border border-border p-0.5"
              >
                {(["light", "dark", "system"] as const).map((value) => {
                  const active = mounted && theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "h-7 rounded-sm px-3 text-xs capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <KeyValues rows={[["Config theme", config?.theme ?? "system"]]} className="mt-3" />
            </Section>

            <Section
              id="notifications"
              title="Notifications"
              description="Sounds when a session finishes or needs your input."
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px]">Play sounds</span>
                <Switch
                  checked={soundsOn}
                  aria-label="Play sounds"
                  onCheckedChange={(value) => {
                    setSoundsOn(value);
                    setSoundsEnabled(value);
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    unlockAudio();
                    playSound("done", { force: true });
                  }}
                >
                  Test finish sound
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    unlockAudio();
                    playSound("attention", { force: true });
                  }}
                >
                  Test input sound
                </Button>
              </div>
            </Section>

            <Section id="shortcuts" title="Shortcuts" description="Move around without the mouse.">
              <dl className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2">
                {[
                  ["Search sessions", "⌘K / Ctrl K"],
                  ["New session", "N"],
                  ["Send message", "Enter"],
                  ["New line", "Shift Enter"],
                  ["Slash commands", "/"],
                  ["Shell command", "!"],
                ].map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-xs">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>
                      <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section
              id="default-model"
              title="Default model"
              description="Pre-selected for new conversations in this browser."
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">New sessions</span>
                <ModelPicker
                  models={models}
                  value={selectedDefaultModel}
                  onChange={changeDefaultModel}
                  allowDefault
                  side="bottom"
                  label="Default model"
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                “Server default” uses whatever the OpenCode server considers
                default. Selecting a model here does not change sessions that
                already have their own model.
              </p>
            </Section>

            <Section
              id="providers"
              title="Providers"
              description={`${connectedProviders.length} connected · ${providers.length} configured`}
            >
              {providers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No providers were returned by the server. Connect one in the TUI
                  with <span className="font-mono">/connect</span>.
                </p>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {providers.map((provider) => (
                    <li key={provider.id} className="flex items-center gap-2.5 px-1 py-2">
                      <StatusDot ok={provider.connected} />
                      <span className="min-w-0 flex-1 truncate text-xs">{provider.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {provider.models} models
                      </span>
                      <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
                        {provider.connected ? "connected" : "no key"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              id="skills"
              title="Skills"
              description={`${skills.length} agent skill${skills.length === 1 ? "" : "s"} discovered by the server.`}
            >
              {skills.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  No skills are available. Add skills to your OpenCode config to
                  enable them here and in the composer.
                </p>
              ) : (
                <ul className="scrollbar-thin max-h-72 divide-y divide-border overflow-y-auto border-y border-border">
                  {skills.map((skill) => (
                    <li key={skill.id} className="px-1 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {skill.name}
                        </span>
                        {skill.autoinvoke ? (
                          <Badge variant="outline">auto</Badge>
                        ) : null}
                      </div>
                      {skill.description ? (
                        <p className="mt-0.5 max-h-8 overflow-hidden text-[11px] leading-relaxed text-muted-foreground">
                          {skill.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Select skills from the composer before sending a message to attach
                them to that turn.
              </p>

              <h3 className="mt-6 text-xs font-medium">Install skills</h3>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Clone a public repository and install its{" "}
                <span className="font-mono">SKILL.md</span> folders into this workspace.
              </p>
              <SkillInstaller />
            </Section>

            <Section
              id="integrations"
              title="Integrations"
              description="MCP servers, language servers and formatters."
            >
              <div className="space-y-4">
                {[
                  { label: "MCP", items: mcpStatuses },
                  { label: "LSP", items: lspStatuses },
                  { label: "Formatters", items: formatterStatuses },
                ].map((group) => (
                  <div key={group.label}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{group.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {group.items.length}
                      </span>
                    </div>
                    {group.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">None configured.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((item) => (
                          <span
                            key={`${group.label}-${item.name}`}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[11px]"
                          >
                            <span
                              className={cn(
                                "status-square",
                                /connect|ready|ok|running/i.test(item.status)
                                  ? "bg-success"
                                  : /error|fail|stop/i.test(item.status)
                                    ? "bg-destructive"
                                    : "bg-muted-foreground/40",
                              )}
                              aria-hidden="true"
                            />
                            <span className="max-w-40 truncate">{item.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {item.status}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section
              id="opencode-account"
              title="OpenCode account"
              description="Sign in to OpenCode Console for OpenCode Go and hosted models."
            >
              <OpenCodeAccountCard integration={integration} />
            </Section>

            <Section
              id="anthropic"
              title="Anthropic API key"
              description={
                serverMode === "per-user"
                  ? "Connect your own Anthropic API key to your OpenCode server."
                  : "Connect an Anthropic API key to OpenCode for Claude models."
              }
            >
              <AnthropicConnectCard
                integration={anthropicIntegration}
                integrationsAvailable={integrationsAvailable}
              />
            </Section>

            <Section
              id="server"
              title="Your server"
              description={
                serverMode === "per-user"
                  ? "A dedicated OpenCode server runs for your account."
                  : "The shared upstream OpenCode HTTP server."
              }
            >
              <CopyRow
                label={serverMode === "per-user" ? "Local endpoint" : "Endpoint"}
                value={serverUrl}
              />
              <CopyRow
                label="Mode"
                value={serverMode === "per-user" ? "per-user · isolated" : "shared"}
              />
              <CopyRow label="Version" value={health?.version ?? "unreachable"} />
              <CopyRow label="Status" value={health?.healthy ? "healthy" : "offline"} />
              <CopyRow label="Default model" value={config?.model ?? "server default"} />
            </Section>

            <Section id="workspace" title="Workspace" description="The project the agent operates on.">
              <CopyRow label="Directory" value={pathInfo?.directory ?? "unknown"} />
              <CopyRow label="Worktree" value={pathInfo?.worktree ?? "unknown"} />
              <CopyRow label="Config" value={pathInfo?.config ?? "unknown"} />
              <CopyRow label="State" value={pathInfo?.state ?? "unknown"} />
            </Section>

            <Section
              id="runtime"
              title="Runtime"
              description="OpenCode configuration detected on the server."
            >
              {config ? (
                <>
                  <CopyRow label="Small model" value={config.smallModel ?? "default"} />
                  <CopyRow
                    label="Autoupdate"
                    value={
                      typeof config.autoupdate === "boolean"
                        ? String(config.autoupdate)
                        : "config default"
                    }
                  />
                  <CopyRow label="Plugins" value={String(config.pluginCount)} />
                  <CopyRow label="MCP entries" value={String(config.mcpCount)} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Configuration could not be read from the server.
                </p>
              )}
            </Section>

            <Section id="security" title="Security" description="How this web client protects the server.">
              <KeyValues
                rows={[
                  ["Session", `signed · ${sessionHours}h`],
                  ["Transport", "same-origin proxy"],
                  ["Login", authMethod],
                  ["Isolation", serverMode === "per-user" ? "per-user server" : "shared server"],
                  ["CSRF", "double submit"],
                ]}
              />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                The browser never receives the OpenCode server password. Credentials
                stay server-side and requests are proxied with opportunistic rate
                limiting on login.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void renewSession()}
                  disabled={renewing}
                >
                  {renewing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Renew session
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut} className="text-destructive">
                  <LogOut className="size-3.5" /> Sign out
                </Button>
              </div>
            </Section>

            <Section id="about" title="About" description="Self-hosted client for the OpenCode server.">
              <Wordmark />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Built with Next.js and shadcn/ui. This project is an independent web
                client and is not affiliated with Anomaly.{" "}
                {serverMode === "per-user"
                  ? "OCTANE starts a private OpenCode server for your account, so sessions and provider keys stay yours."
                  : "It talks only to the OpenCode HTTP API configured through OPENCODE_SERVER_URL."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="https://opencode.ai/docs/server" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" /> Server docs
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href="https://opencode.ai/docs/sdk" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" /> SDK docs
                  </a>
                </Button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Credentials remain server-side · never shipped to the browser
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
