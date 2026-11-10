import { apiFlavor, UpstreamError, upstreamJson } from "./upstream";
import type {
  IntegrationAttemptInfo,
  IntegrationAttemptStatus,
  IntegrationConnection,
  IntegrationMethodInfo,
  IntegrationPrompt,
  ProviderIntegration,
} from "./types";

type Raw = Record<string, unknown>;

function raw(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapPrompt(value: unknown): IntegrationPrompt {
  const prompt = raw(value);
  return {
    type: str(prompt.type, "text"),
    key: str(prompt.key),
    title: str(prompt.title) || undefined,
    message: str(prompt.message) || undefined,
    description: str(prompt.description) || undefined,
    placeholder: str(prompt.placeholder) || undefined,
    required: prompt.required === true,
    default: str(prompt.default) || undefined,
    options: arr(prompt.options).map((option) => {
      const item = raw(option);
      return {
        label: str(item.label, str(item.value)),
        value: str(item.value),
        hint: str(item.hint) || undefined,
      };
    }),
    when:
      prompt.when && typeof prompt.when === "object"
        ? {
            key: str(raw(prompt.when).key),
            op: str(raw(prompt.when).op) === "neq" ? "neq" : "eq",
            value: str(raw(prompt.when).value),
          }
        : undefined,
  };
}

function mapMethod(value: unknown): IntegrationMethodInfo {
  const method = raw(value);
  return {
    id: str(method.id) || undefined,
    type: str(method.type, "key"),
    label: str(method.label) || undefined,
    names: arr(method.names).map((name) => str(name)).filter(Boolean),
    prompts: arr(method.prompts).map(mapPrompt),
    form: arr(method.form).map(mapPrompt),
  };
}

function mapConnection(value: unknown): IntegrationConnection {
  const connection = raw(value);
  return {
    type: str(connection.type, "credential"),
    id: str(connection.id) || undefined,
    label: str(connection.label, str(connection.name)) || undefined,
    method: str(connection.method) || undefined,
  };
}

function mapIntegration(value: unknown): ProviderIntegration {
  const integration = raw(value);
  return {
    id: str(integration.id),
    name: str(integration.name, str(integration.id)),
    methods: arr(integration.methods).map(mapMethod),
    connections: arr(integration.connections).map(mapConnection),
  };
}

export async function integrationsSupported(): Promise<boolean> {
  return (await apiFlavor()) === "v2";
}

/** OpenCode v2 `/api/integration` is the `/connect` surface. */
export async function listIntegrations(): Promise<ProviderIntegration[] | null> {
  if ((await apiFlavor()) !== "v2") return null;
  const result = await upstreamJson<Raw>("/api/integration");
  return arr(result.data).map(mapIntegration);
}

export async function getIntegration(
  id: string,
): Promise<ProviderIntegration | null> {
  if ((await apiFlavor()) !== "v2") return null;
  // Integrations load asynchronously after a per-user server starts; a newly
  // spawned server can answer 404 for a moment even though `/api/info` is up.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await upstreamJson<Raw>(
        `/api/integration/${encodeURIComponent(id)}`,
      );
      return mapIntegration(result.data);
    } catch (error) {
      const retryable =
        error instanceof UpstreamError && error.status === 404 && attempt < 2;
      if (!retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return null;
}

export async function connectIntegrationKey(
  id: string,
  key: string,
  label?: string,
): Promise<void> {
  await upstreamJson(`/api/integration/${encodeURIComponent(id)}/connect/key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key,
      ...(label?.trim() ? { label: label.trim() } : {}),
    }),
  });
}

export async function startIntegrationOAuth(
  id: string,
  methodID: string,
  inputs: Record<string, string> = {},
  label?: string,
): Promise<IntegrationAttemptInfo> {
  const result = await upstreamJson<Raw>(
    `/api/integration/${encodeURIComponent(id)}/connect/oauth`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        methodID,
        inputs,
        ...(label?.trim() ? { label: label.trim() } : {}),
      }),
    },
  );
  const data = raw(result.data);
  const time = raw(data.time);
  return {
    attemptID: str(data.attemptID),
    url: str(data.url),
    instructions: str(data.instructions),
    mode: str(data.mode) === "code" ? "code" : "auto",
    expires: num(time.expires) || undefined,
  };
}

export async function getIntegrationAttemptStatus(
  attemptID: string,
): Promise<IntegrationAttemptStatus> {
  const result = await upstreamJson<Raw>(
    `/api/integration/attempt/${encodeURIComponent(attemptID)}`,
  );
  const data = raw(result.data);
  const status = str(data.status, "pending");
  return {
    status: (["pending", "complete", "failed", "expired"].includes(status)
      ? status
      : "pending") as IntegrationAttemptStatus["status"],
    message: str(data.message) || undefined,
  };
}

export async function completeIntegrationOAuth(
  attemptID: string,
  code?: string,
): Promise<void> {
  await upstreamJson(
    `/api/integration/attempt/${encodeURIComponent(attemptID)}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code || null }),
    },
  );
}

export async function cancelIntegrationAttempt(attemptID: string): Promise<void> {
  await upstreamJson(`/api/integration/attempt/${encodeURIComponent(attemptID)}`, {
    method: "DELETE",
  });
}

export async function deleteIntegrationCredential(
  credentialID: string,
): Promise<void> {
  await upstreamJson(`/api/credential/${encodeURIComponent(credentialID)}`, {
    method: "DELETE",
  });
}
