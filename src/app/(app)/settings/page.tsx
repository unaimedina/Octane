import { SettingsView } from "@/components/settings/settings-view";
import {
  discordConfigured,
  passwordConfigured,
} from "@/lib/env";
import { getIntegration, integrationsSupported } from "@/lib/integrations";
import {
  getConfig,
  getFormatterStatus,
  getLspStatus,
  getMcpStatus,
  getOpenCodeIntegration,
} from "@/lib/oc-server";
import { getHealth, getPathInfo, getProviders } from "@/lib/session-service";
import { currentServerDisplay } from "@/lib/tenant";
import { SESSION_TTL_SECONDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [
    health,
    pathInfo,
    config,
    providers,
    mcp,
    lsp,
    formatter,
    integration,
    server,
  ] = await Promise.all([
    getHealth(),
    getPathInfo(),
    getConfig(),
    getProviders(),
    getMcpStatus(),
    getLspStatus(),
    getFormatterStatus(),
    getOpenCodeIntegration(),
    currentServerDisplay(),
  ]);

  const [anthropicIntegration, integrationsAvailable] = await Promise.all([
    getIntegration("anthropic").catch(() => null),
    integrationsSupported(),
  ]);

  const providerMap = new Map<
    string,
    { id: string; name: string; connected: boolean; models: number }
  >();
  for (const model of providers.models) {
    const entry = providerMap.get(model.providerID) ?? {
      id: model.providerID,
      name: model.providerName,
      connected: model.connected,
      models: 0,
    };
    entry.models += 1;
    entry.connected = entry.connected || model.connected;
    providerMap.set(model.providerID, entry);
  }

  const raw = config as Record<string, unknown> | null;
  const safeConfig = raw
    ? {
        theme: typeof raw.theme === "string" ? raw.theme : null,
        model: typeof raw.model === "string" ? raw.model : null,
        smallModel:
          typeof raw.small_model === "string" ? raw.small_model : null,
        autoupdate: raw.autoupdate ?? null,
        share: raw.share ?? null,
        pluginCount: Array.isArray(raw.plugin) ? raw.plugin.length : 0,
        mcpCount:
          raw.mcp && typeof raw.mcp === "object"
            ? Object.keys(raw.mcp as object).length
            : 0,
      }
    : null;

  const authMethods = [
    passwordConfigured() ? "password" : null,
    discordConfigured() ? "Discord role" : null,
  ].filter(Boolean);
  const authMethod = authMethods.length ? authMethods.join(" + ") : "not configured";

  return (
    <SettingsView
      health={health}
      pathInfo={pathInfo}
      serverUrl={server.url}
      serverMode={server.mode}
      providers={[...providerMap.values()].sort((a, b) => a.name.localeCompare(b.name))}
      config={safeConfig}
      mcp={mcp}
      lsp={lsp}
      formatter={formatter}
      integration={integration}
      anthropicIntegration={anthropicIntegration}
      integrationsAvailable={integrationsAvailable}
      authMethod={authMethod}
      sessionHours={Math.round(SESSION_TTL_SECONDS / 3600)}
    />
  );
}
