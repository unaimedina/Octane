"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  Plug,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, apiJson, jsonBody } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  IntegrationAttemptInfo,
  IntegrationAttemptStatus,
  IntegrationMethodInfo,
  ProviderIntegration,
} from "@/lib/types";

function statusLabel(status: IntegrationAttemptStatus["status"]): string {
  switch (status) {
    case "complete":
      return "Connected";
    case "failed":
      return "Connection failed";
    case "expired":
      return "Code expired";
    default:
      return "Waiting for authorization";
  }
}

export function AnthropicConnectCard({
  integration,
  integrationsAvailable,
}: {
  integration: ProviderIntegration | null;
  integrationsAvailable: boolean;
}) {
  const router = useRouter();
  const [keyOpen, setKeyOpen] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState<IntegrationAttemptInfo | null>(null);
  const [status, setStatus] = React.useState<IntegrationAttemptStatus["status"]>("pending");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const keyMethod = integration?.methods.find((method) => method.type === "key");
  const oauthMethods = (integration?.methods ?? []).filter(
    (method): method is IntegrationMethodInfo & { id: string } =>
      method.type === "oauth" && Boolean(method.id),
  );
  const envMethod = integration?.methods.find((method) => method.type === "env");
  const connections = integration?.connections ?? [];

  function refresh() {
    router.refresh();
  }

  async function connectKey(event: React.FormEvent) {
    event.preventDefault();
    if (!integration || !key.trim() || busy) return;
    setBusy("key");
    try {
      await apiJson(`/integrations/${encodeURIComponent(integration.id)}/connect/key`, {
        method: "POST",
        ...jsonBody({ key: key.trim(), label: label.trim() }),
      });
      toast.success("Anthropic connected");
      setKeyOpen(false);
      setKey("");
      setLabel("");
      refresh();
    } catch (error) {
      toast.error("Could not connect Anthropic", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function startOAuth(method: IntegrationMethodInfo) {
    if (!integration || !method.id || busy) return;
    setBusy(method.id);
    setStatus("pending");
    setStatusMessage(null);
    try {
      const next = await apiJson<IntegrationAttemptInfo>(
        `/integrations/${encodeURIComponent(integration.id)}/connect/oauth`,
        {
          method: "POST",
          ...jsonBody({ methodID: method.id, inputs: {} }),
        },
      );
      setAttempt(next);
    } catch (error) {
      toast.error("Could not start the connection", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  React.useEffect(() => {
    if (!attempt || attempt.mode !== "auto") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const next = await apiJson<IntegrationAttemptStatus>(
          `/integrations/attempts/${encodeURIComponent(attempt.attemptID)}`,
        );
        if (cancelled) return;
        setStatus(next.status);
        setStatusMessage(next.message ?? null);
        if (next.status === "complete") {
          window.clearInterval(timer);
          setAttempt(null);
          toast.success("Anthropic connected");
          router.refresh();
        } else if (next.status === "failed" || next.status === "expired") {
          window.clearInterval(timer);
        }
      } catch {
        // keep polling through transient failures
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attempt, router]);

  async function closeAttempt() {
    if (attempt) {
      await api(`/integrations/attempts/${encodeURIComponent(attempt.attemptID)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    setAttempt(null);
    setCode("");
    setStatus("pending");
    setStatusMessage(null);
  }

  async function completeCode(event: React.FormEvent) {
    event.preventDefault();
    if (!attempt || !code.trim()) return;
    setBusy("code");
    try {
      await apiJson(`/integrations/attempts/${encodeURIComponent(attempt.attemptID)}/complete`, {
        method: "POST",
        ...jsonBody({ code: code.trim() }),
      });
      setAttempt(null);
      setCode("");
      toast.success("Anthropic connected");
      refresh();
    } catch (error) {
      toast.error("Could not complete the connection", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(connectionID: string) {
    setBusy(connectionID);
    try {
      await apiJson(`/integrations/credentials/${encodeURIComponent(connectionID)}`, {
        method: "DELETE",
      });
      toast.success("Anthropic disconnected");
      refresh();
    } catch (error) {
      toast.error("Could not disconnect", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <>
      <div className="space-y-3">
        {connections.length > 0 ? (
          <div className="space-y-1.5">
            {connections.map((connection, index) => (
              <div
                key={connection.id ?? `${connection.type}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-2.5 py-2"
              >
                <BadgeCheck className="size-4 shrink-0 text-success" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {connection.label ?? "Anthropic API key"}
                </span>
                <Badge variant="outline" className="font-mono text-[9px] uppercase">
                  {connection.method ?? connection.type}
                </Badge>
                {connection.id ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void disconnect(connection.id!)}
                    disabled={busy !== null}
                    aria-label="Disconnect Anthropic"
                  >
                    {busy === connection.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
            <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Connect Anthropic to your OpenCode server. Claude models then appear in
              the OpenCode model picker as normal provider models.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {keyMethod ? (
            <Button size="sm" onClick={() => setKeyOpen(true)} disabled={busy !== null}>
              <KeyRound className="size-3.5" /> Connect with API key
            </Button>
          ) : null}
          {oauthMethods.map((method) => (
            <Button
              key={method.id}
              size="sm"
              variant="outline"
              onClick={() => void startOAuth(method)}
              disabled={busy !== null}
            >
              {busy === method.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LogIn className="size-3.5" />
              )}
              {method.label ?? "Sign in with Anthropic"}
            </Button>
          ))}
        </div>

        {!integrationsAvailable ? (
          <p className="text-[11px] text-muted-foreground">
            Provider connections require the OpenCode v2 API. Use{" "}
            <span className="font-mono">/connect</span> from the TUI on older servers.
          </p>
        ) : !integration ? (
          <p className="text-[11px] text-muted-foreground">
            This OpenCode server does not expose an Anthropic integration. Use{" "}
            <span className="font-mono">/connect</span> from the TUI.
          </p>
        ) : envMethod ? (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            You can also set{" "}
            {envMethod.names?.map((name, index) => (
              <React.Fragment key={name}>
                {index > 0 ? " or " : ""}
                <span className="font-mono">{name}</span>
              </React.Fragment>
            ))}{" "}
            on the OpenCode server.
          </p>
        ) : null}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          This key is stored on your OpenCode server and is only used for your
          sessions.
        </p>
      </div>

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Connect Anthropic
            </DialogTitle>
            <DialogDescription>
              The key is stored on your own OpenCode server, never in this browser.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={connectKey} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="anthropic-key">API key</Label>
              <Input
                id="anthropic-key"
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="anthropic-label">Label (optional)</Label>
              <Input
                id="anthropic-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Personal"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setKeyOpen(false)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!key.trim() || busy !== null}>
                {busy === "key" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plug className="size-4" />
                )}
                Connect
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(attempt)}
        onOpenChange={(next) => {
          if (!next) void closeAttempt();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="size-4" /> Connect Anthropic
            </DialogTitle>
            <DialogDescription>
              Complete the authorization in your browser. Credentials stay on the
              OpenCode server.
            </DialogDescription>
          </DialogHeader>
          {attempt ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {attempt.instructions || "Approve the connection in your browser."}
                </p>
                {attempt.url ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={attempt.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-3.5" /> Open authorization
                      </a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void copy(attempt.url)}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      Copy URL
                    </Button>
                  </div>
                ) : null}
              </div>
              {attempt.mode === "code" ? (
                <form onSubmit={completeCode} className="space-y-2">
                  <Label htmlFor="anthropic-code">Authorization code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="anthropic-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Paste the code"
                      autoComplete="one-time-code"
                      className="font-mono text-xs"
                      autoFocus
                    />
                    <Button type="submit" disabled={!code.trim() || busy !== null}>
                      {busy === "code" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Complete
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {status === "pending" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : status === "complete" ? (
                    <BadgeCheck className="size-3.5 text-success" />
                  ) : (
                    <CircleAlert className="size-3.5 text-warning" />
                  )}
                  {statusLabel(status)}
                  {statusMessage ? ` — ${statusMessage}` : ""}
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => void closeAttempt()}>
              Cancel
            </Button>
            {attempt?.mode === "auto" ? (
              <Button
                onClick={() => {
                  void (async () => {
                    try {
                      const next = await apiJson<IntegrationAttemptStatus>(
                        `/integrations/attempts/${encodeURIComponent(attempt.attemptID)}`,
                      );
                      setStatus(next.status);
                      setStatusMessage(next.message ?? null);
                      if (next.status === "complete") {
                        setAttempt(null);
                        toast.success("Anthropic connected");
                        refresh();
                      } else {
                        toast.message("Still waiting for authorization");
                      }
                    } catch (error) {
                      toast.error("Could not check the connection", {
                        description: error instanceof Error ? error.message : undefined,
                      });
                    }
                  })();
                }}
              >
                Check again
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
