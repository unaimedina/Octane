"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Loader2,
  LogIn,
  UserRound,
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
import type {
  IntegrationConnection,
  OAuthAttempt,
  OAuthStatus,
  OpenCodeIntegration,
} from "@/lib/types";

function statusLabel(status: OAuthStatus["status"]): string {
  switch (status) {
    case "complete":
      return "Authorized";
    case "failed":
      return "Authorization failed";
    case "expired":
      return "Code expired";
    default:
      return "Waiting for authorization";
  }
}

export function OpenCodeAccountCard({
  integration,
}: {
  integration: OpenCodeIntegration | null;
}) {
  const router = useRouter();
  const [connections, setConnections] = React.useState<IntegrationConnection[]>(
    integration?.connections ?? [],
  );
  const [open, setOpen] = React.useState(false);
  const [attempt, setAttempt] = React.useState<OAuthAttempt | null>(null);
  const [status, setStatus] = React.useState<OAuthStatus["status"]>("pending");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [completing, setCompleting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    queueMicrotask(() => {
      setConnections(integration?.connections ?? []);
    });
  }, [integration]);

  const start = React.useCallback(async () => {
    if (!integration?.oauthMethodID) return;
    setStarting(true);
    setStatus("pending");
    setStatusMessage(null);
    try {
      const next = await apiJson<OAuthAttempt>("/integrations/opencode/connect", {
        method: "POST",
        ...jsonBody({ methodID: integration.oauthMethodID }),
      });
      setAttempt(next);
      setOpen(true);
    } catch (error) {
      toast.error("Could not start OpenCode sign-in", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setStarting(false);
    }
  }, [integration]);

  const refreshIntegration = React.useCallback(async () => {
    try {
      const next = await apiJson<OpenCodeIntegration>("/integrations/opencode");
      setConnections(next.connections);
      router.refresh();
    } catch {
      // the page still has the previous connection state
    }
  }, [router]);

  React.useEffect(() => {
    if (!open || !attempt || attempt.mode !== "auto") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const next = await apiJson<OAuthStatus>(
          `/integrations/opencode/connect/${encodeURIComponent(attempt.attemptID)}`,
        );
        if (cancelled) return;
        setStatus(next.status);
        setStatusMessage(next.message ?? null);
        if (next.status === "complete") {
          window.clearInterval(timer);
          setOpen(false);
          setAttempt(null);
          toast.success("OpenCode account connected");
          await refreshIntegration();
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
  }, [open, attempt, refreshIntegration]);

  async function closeDialog() {
    if (attempt) {
      try {
        await api(`/integrations/opencode/connect/${encodeURIComponent(attempt.attemptID)}`, {
          method: "DELETE",
        });
      } catch {
        // ignore cancellation failures
      }
    }
    setOpen(false);
    setAttempt(null);
    setStatus("pending");
    setStatusMessage(null);
    setCode("");
  }

  async function completeCode() {
    if (!attempt || !code.trim()) return;
    setCompleting(true);
    try {
      await apiJson(
        `/integrations/opencode/connect/${encodeURIComponent(attempt.attemptID)}/complete`,
        { method: "POST", ...jsonBody({ code: code.trim() }) },
      );
      setOpen(false);
      setAttempt(null);
      setCode("");
      toast.success("OpenCode account connected");
      await refreshIntegration();
    } catch (error) {
      toast.error("Could not complete sign-in", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCompleting(false);
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
            {connections.map((connection) => (
              <div
                key={connection.id ?? connection.label ?? connection.type}
                className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-2.5 py-2"
              >
                <BadgeCheck className="size-4 shrink-0 text-success" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {connection.label ?? "OpenCode account"}
                </span>
                <Badge variant="outline" className="font-mono text-[9px] uppercase">
                  {connection.method ?? connection.type}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
            <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Connect an OpenCode Console account to use OpenCode Go and hosted
              models from this web client.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void start()}
            disabled={starting || !integration?.oauthMethodID}
          >
            {starting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : connections.length > 0 ? (
              <UserRound className="size-3.5" />
            ) : (
              <LogIn className="size-3.5" />
            )}
            {connections.length > 0 ? "Add another account" : "Sign in to OpenCode"}
          </Button>
        </div>

        {!integration?.oauthMethodID ? (
          <p className="text-[11px] text-muted-foreground">
            This server does not expose an OpenCode OAuth method. Sign in from the
            TUI with <span className="font-mono">/connect</span>.
          </p>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) void closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="size-4" /> Sign in to OpenCode Console
            </DialogTitle>
            <DialogDescription>
              Authorize this server in your browser. Credentials stay on the
              OpenCode server, never in this web app.
            </DialogDescription>
          </DialogHeader>

          {attempt ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {attempt.instructions ||
                    "Open the OpenCode Console, approve this device, then return here."}
                </p>
                {attempt.url ? (
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5" asChild>
                    <a
                      href={attempt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" /> Open OpenCode Console
                    </a>
                  </Button>
                ) : null}
              </div>

              {attempt.url ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                    {attempt.url}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void copy(attempt.url)}
                    aria-label="Copy sign-in URL"
                  >
                    {copied ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              ) : null}

              {attempt.mode === "code" ? (
                <div className="space-y-2">
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Paste the authorization code"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => void completeCode()}
                    disabled={!code.trim() || completing}
                  >
                    {completing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    Complete sign-in
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  {status === "pending" ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  ) : status === "complete" ? (
                    <BadgeCheck className="size-3.5 text-success" />
                  ) : (
                    <CircleAlert className="size-3.5 text-warning" />
                  )}
                  <span
                    className={
                      status === "failed" || status === "expired"
                        ? "text-warning dark:text-warning"
                        : "text-muted-foreground"
                    }
                  >
                    {statusLabel(status)}
                    {statusMessage ? ` — ${statusMessage}` : ""}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void closeDialog()}
              disabled={completing}
            >
              Cancel
            </Button>
            {attempt && attempt.mode === "auto" ? (
              <Button
                onClick={() => {
                  void (async () => {
                    try {
                      const next = await apiJson<OAuthStatus>(
                        `/integrations/opencode/connect/${encodeURIComponent(attempt.attemptID)}`,
                      );
                      if (next.status === "complete") {
                        setOpen(false);
                        setAttempt(null);
                        toast.success("OpenCode account connected");
                        await refreshIntegration();
                      } else {
                        toast.message("Still waiting for authorization");
                      }
                    } catch (error) {
                      toast.error("Could not check authorization", {
                        description:
                          error instanceof Error ? error.message : undefined,
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
