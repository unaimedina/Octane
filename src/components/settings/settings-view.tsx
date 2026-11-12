"use client";

import * as React from "react";
import {
  Activity,
  Bell,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  FolderGit2,
  KeyRound,
  Keyboard,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Plug,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Workflow,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
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
      className={cn(
        "size-1.5 rounded-full",
        ok ? "bg-success shadow-[0_0_8px] shadow-success/50" : "bg-warning",
      )}
    />
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

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connection, security and workspace details for this deployment.
            </p>
          </div>
          <Badge variant={health?.healthy ? "secondary" : "outline"} className="gap-1.5">
            <StatusDot ok={Boolean(health?.healthy)} />
            {health?.healthy ? `OpenCode ${health.version}` : "Server unreachable"}
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Server className="size-4" /> Your server
              </CardTitle>
              <CardDescription>
                {serverMode === "per-user"
                  ? "A dedicated OpenCode server runs for your account."
                  : "The shared upstream OpenCode HTTP server."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CopyRow
                label={serverMode === "per-user" ? "Local endpoint" : "Endpoint"}
                value={serverUrl}
              />
              <CopyRow
                label="Mode"
                value={serverMode === "per-user" ? "per-user · isolated" : "shared"}
              />
              <CopyRow label="Version" value={health?.version ?? "unreachable"} />
              <CopyRow
                label="Status"
                value={health?.healthy ? "healthy" : "offline"}
              />
              <CopyRow
                label="Default model"
                value={config?.model ?? "server default"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FolderGit2 className="size-4" /> Workspace
              </CardTitle>
              <CardDescription>The project the agent operates on.</CardDescription>
            </CardHeader>
            <CardContent>
              <CopyRow label="Directory" value={pathInfo?.directory ?? "unknown"} />
              <CopyRow label="Worktree" value={pathInfo?.worktree ?? "unknown"} />
              <CopyRow label="Config" value={pathInfo?.config ?? "unknown"} />
              <CopyRow label="State" value={pathInfo?.state ?? "unknown"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="size-4" /> Notifications
              </CardTitle>
              <CardDescription>
                Sounds when a session finishes or needs your input.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Play sounds</span>
                <Switch
                  checked={soundsOn}
                  aria-label="Play sounds"
                  onCheckedChange={(value) => {
                    setSoundsOn(value);
                    setSoundsEnabled(value);
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4" /> Security
              </CardTitle>
              <CardDescription>How this web client protects the server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Session", `signed · ${sessionHours}h`],
                  ["Transport", "same-origin proxy"],
                  ["Login", authMethod],
                  ["Isolation", serverMode === "per-user" ? "per-user server" : "shared server"],
                  ["CSRF", "double submit"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[10px] border border-border/60 bg-card/30 px-2.5 py-2"
                  >
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                      {label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium">{value}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The browser never receives the OpenCode server password. Credentials
                stay server-side and requests are proxied with opportunistic rate
                limiting on login.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void renewSession()} disabled={renewing}>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sun className="size-4" /> Appearance
              </CardTitle>
              <CardDescription>Theme is stored in this browser.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-[10px] border px-3 py-3 text-xs transition-colors",
                      mounted && theme === option.value
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-border/60 bg-card/30 text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <option.icon className="size-4" />
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-[10px] border border-border/60 bg-card/30 px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Config theme</span>
                <span className="font-mono">{config?.theme ?? "system"}</span>
              </div>
            </CardContent>
          </Card>

          <Card id="opencode-account" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <LogIn className="size-4" /> OpenCode account
              </CardTitle>
              <CardDescription>
                Sign in to OpenCode Console for OpenCode Go and hosted models.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OpenCodeAccountCard integration={integration} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Plug className="size-4" /> Anthropic API key
              </CardTitle>
              <CardDescription>
                {serverMode === "per-user"
                  ? "Connect your own Anthropic API key to your OpenCode server."
                  : "Connect an Anthropic API key to OpenCode for Claude models."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnthropicConnectCard
                integration={anthropicIntegration}
                integrationsAvailable={integrationsAvailable}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cpu className="size-4" /> Default model
              </CardTitle>
              <CardDescription>
                Pre-selected for new conversations in this browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border/60 bg-card/30 px-2.5 py-2">
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
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                “Server default” uses whatever the OpenCode server considers
                default. Selecting a model here does not change sessions that
                already have their own model.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4" /> Skills
              </CardTitle>
              <CardDescription>
                {skills.length} agent skill{skills.length === 1 ? "" : "s"} discovered
                by the server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {skills.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  No skills are available. Add skills to your OpenCode config to
                  enable them here and in the composer.
                </p>
              ) : (
                <ul className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {skills.map((skill) => (
                    <li
                      key={skill.id}
                      className="rounded-[10px] border border-border/60 bg-muted/15 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-3.5 shrink-0 text-success" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {skill.name}
                        </span>
                        {skill.autoinvoke ? (
                          <Badge variant="outline" className="font-mono text-[9px]">
                            auto
                          </Badge>
                        ) : null}
                      </div>
                      {skill.description ? (
                        <p className="mt-1 max-h-8 overflow-hidden text-[10px] leading-relaxed text-muted-foreground">
                          {skill.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Select skills from the composer before sending a message to attach
                them to that turn.
              </p>
            </CardContent>
          </Card>

          <SkillInstaller />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cpu className="size-4" /> Providers
              </CardTitle>
              <CardDescription>
                {connectedProviders.length} connected · {providers.length} configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providers.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">
                  No providers were returned by the server. Connect one in the TUI
                  with <span className="font-mono">/connect</span>.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {providers.map((provider) => (
                    <li
                      key={provider.id}
                      className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-2"
                    >
                      <StatusDot ok={provider.connected} />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {provider.name}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {provider.models} models
                      </span>
                      <Badge
                        variant={provider.connected ? "secondary" : "outline"}
                        className="font-mono text-[9px]"
                      >
                        {provider.connected ? "connected" : "no key"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Plug className="size-4" /> Integrations
              </CardTitle>
              <CardDescription>MCP servers, language servers and formatters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "MCP", items: mcpStatuses },
                { label: "LSP", items: lspStatuses },
                { label: "Formatters", items: formatterStatuses },
              ].map((group) => (
                <div key={group.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                      {group.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/50">
                      {group.items.length}
                    </span>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/60">None configured.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <span
                          key={`${group.label}-${item.name}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/25 px-2 py-1 text-[10px]"
                        >
                          <span
                            className={cn(
                              "size-1 rounded-full",
                              /connect|ready|ok|running/i.test(item.status)
                                ? "bg-success"
                                : /error|fail|stop/i.test(item.status)
                                  ? "bg-destructive"
                                  : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="max-w-40 truncate">{item.name}</span>
                          <span className="font-mono text-[9px] text-muted-foreground/60">
                            {item.status}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Keyboard className="size-4" /> Shortcuts
              </CardTitle>
              <CardDescription>Move around without the mouse.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1.5">
                {[
                  ["Search sessions", "⌘K / Ctrl K"],
                  ["New session", "N"],
                  ["Send message", "Enter"],
                  ["New line", "Shift Enter"],
                  ["Slash commands", "/"],
                  ["Shell command", "!"],
                ].map(([label, keys]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-md px-1 py-1 text-xs"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>
                      <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="size-4" /> Runtime
              </CardTitle>
              <CardDescription>OpenCode configuration detected on the server.</CardDescription>
            </CardHeader>
            <CardContent>
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
                  <CopyRow
                    label="Plugins"
                    value={String(config.pluginCount)}
                  />
                  <CopyRow label="MCP entries" value={String(config.mcpCount)} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Configuration could not be read from the server.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Workflow className="size-4" /> About
              </CardTitle>
              <CardDescription>Self-hosted client for the OpenCode server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Wordmark />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Built with Next.js and shadcn/ui. This project is an independent web
                client and is not affiliated with Anomaly.{" "}
                {serverMode === "per-user"
                  ? "OCTANE starts a private OpenCode server for your account, so sessions and provider keys stay yours."
                  : "It talks only to the OpenCode HTTP API configured through OPENCODE_SERVER_URL."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://opencode.ai/docs/server"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" /> Server docs
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href="https://opencode.ai/docs/sdk"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" /> SDK docs
                  </a>
                </Button>
              </div>
              <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground/60">
                <KeyRound className="size-3" />
                Credentials remain server-side · never shipped to the browser
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
