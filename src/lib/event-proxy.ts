import { apiFlavor, upstreamFetch } from "./upstream";
import { getMessageById, getSession, getSessionDiff } from "./oc-server";
import type { SessionStatus } from "./types";

type Raw = Record<string, unknown>;

function raw(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const TOKEN_ZERO = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };

type AssistantState = {
  sessionID: string;
  id: string;
  created: number;
  agent: string;
  providerID: string;
  modelID: string;
  completed?: number;
  cost?: number;
  tokens?: Record<string, unknown>;
};

function assistantInfo(state: AssistantState) {
  const tokens = raw(state.tokens);
  const cache = raw(tokens.cache);
  return {
    id: state.id,
    sessionID: state.sessionID,
    role: "assistant" as const,
    time: {
      created: state.created,
      ...(state.completed ? { completed: state.completed } : {}),
    },
    parentID: "",
    modelID: state.modelID,
    providerID: state.providerID,
    mode: state.agent,
    path: { cwd: "", root: "" },
    cost: state.cost ?? 0,
    tokens: state.tokens
      ? {
          input: num(tokens.input),
          output: num(tokens.output),
          reasoning: num(tokens.reasoning),
          cache: { read: num(cache.read), write: num(cache.write) },
        }
      : TOKEN_ZERO,
  };
}

/**
 * Translate the v2 `/api/event` stream into the v1 event vocabulary consumed by
 * the UI. v1 servers are proxied through unchanged.
 */
export async function openEventStream(signal: AbortSignal): Promise<Response> {
  const flavor = await apiFlavor();
  const upstream = await upstreamFetch(flavor === "v1" ? "/event" : "/api/event", {
    headers: { accept: "text/event-stream" },
    signal,
    timeoutMs: 0,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      JSON.stringify({ error: "upstream_unreachable", message: "Event stream unavailable." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  if (flavor === "v1") {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const assistants = new Map<string, AssistantState>();
  const textParts = new Map<string, string>();
  const reasoningParts = new Map<string, string>();
  const chains = new Map<string, Promise<void>>();

  function queueSync(key: string, task: () => Promise<void>) {
    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task).catch(() => undefined);
    chains.set(key, next);
  }

  const body = upstream.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
            try {
              await handleBlock(block, controller);
            } catch {
              // A malformed event should not tear down the stream.
            }
          }
        }
      } catch {
        // Client disconnected or the upstream stream ended abruptly.
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
        reader.releaseLock();
      }
    },
  });

  async function handleBlock(
    block: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) return;

    let event: Raw;
    try {
      event = raw(JSON.parse(dataLines.join("\n")));
    } catch {
      return;
    }

    const type = str(event.type);
    const data = raw(event.data);
    const created = num(event.created, Date.now());
    const sessionID = str(data.sessionID);

    const emit = (payload: unknown) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    switch (type) {
      case "server.connected":
        emit({ type: "server.connected", properties: {} });
        return;

      case "session.execution.started":
        emit({
          type: "session.status",
          properties: { sessionID, status: { type: "busy" } satisfies SessionStatus },
        });
        return;

      case "session.execution.succeeded":
        emit({ type: "session.idle", properties: { sessionID } });
        emit({
          type: "session.status",
          properties: { sessionID, status: { type: "idle" } satisfies SessionStatus },
        });
        return;

      case "session.execution.interrupted":
        emit({ type: "session.idle", properties: { sessionID } });
        return;

      case "session.execution.failed": {
        const error = raw(data.error);
        emit({
          type: "session.error",
          properties: {
            sessionID,
            error: {
              name: str(error.type, "UnknownError"),
              data: { message: str(error.message, "Execution failed") },
            },
          },
        });
        emit({ type: "session.idle", properties: { sessionID } });
        return;
      }

      case "session.step.started": {
        const id = str(data.assistantMessageID);
        const model = raw(data.model);
        if (!id || !sessionID) return;
        const state: AssistantState = {
          sessionID,
          id,
          created: num(data.started, created),
          agent: str(data.agent, "build"),
          providerID: str(model.providerID),
          modelID: str(model.id, str(model.modelID)),
        };
        assistants.set(id, state);
        emit({ type: "message.updated", properties: { info: assistantInfo(state) } });
        emit({
          type: "session.status",
          properties: { sessionID, status: { type: "busy" } satisfies SessionStatus },
        });
        return;
      }

      case "session.text.started": {
        const messageID = str(data.assistantMessageID);
        const partID = `${messageID}:text:${num(data.ordinal)}`;
        textParts.set(partID, "");
        emit({
          type: "message.part.updated",
          properties: {
            part: {
              id: partID,
              sessionID,
              messageID,
              type: "text",
              text: "",
            },
          },
        });
        return;
      }

      case "session.text.delta": {
        const messageID = str(data.assistantMessageID);
        const partID = `${messageID}:text:${num(data.ordinal)}`;
        const next = `${textParts.get(partID) ?? ""}${str(data.delta)}`;
        textParts.set(partID, next);
        emit({
          type: "message.part.updated",
          properties: {
            part: {
              id: partID,
              sessionID,
              messageID,
              type: "text",
              text: next,
            },
            delta: str(data.delta),
          },
        });
        return;
      }

      case "session.text.ended": {
        const messageID = str(data.assistantMessageID);
        const partID = `${messageID}:text:${num(data.ordinal)}`;
        const text = str(data.text, textParts.get(partID) ?? "");
        textParts.set(partID, text);
        emit({
          type: "message.part.updated",
          properties: {
            part: {
              id: partID,
              sessionID,
              messageID,
              type: "text",
              text,
              time: { start: created, end: created },
            },
          },
        });
        return;
      }

      case "session.reasoning.started": {
        const messageID = str(data.assistantMessageID);
        const partID = `${messageID}:reasoning:${num(data.ordinal)}`;
        reasoningParts.set(partID, "");
        return;
      }

      case "session.reasoning.delta": {
        const messageID = str(data.assistantMessageID);
        const partID = `${messageID}:reasoning:${num(data.ordinal)}`;
        const next = `${reasoningParts.get(partID) ?? ""}${str(data.delta)}`;
        reasoningParts.set(partID, next);
        emit({
          type: "message.part.updated",
          properties: {
            part: {
              id: partID,
              sessionID,
              messageID,
              type: "reasoning",
              text: next,
              time: { start: created },
            },
          },
        });
        return;
      }

      case "session.reasoning.ended": {
        const messageID = str(data.assistantMessageID);
        const partID = `${messageID}:reasoning:${num(data.ordinal)}`;
        const text = str(data.text, reasoningParts.get(partID) ?? "");
        emit({
          type: "message.part.updated",
          properties: {
            part: {
              id: partID,
              sessionID,
              messageID,
              type: "reasoning",
              text,
              time: { start: created, end: created },
            },
          },
        });
        return;
      }

      case "session.tool.input.started":
      case "session.tool.input.ended":
      case "session.tool.called":
      case "session.tool.success":
      case "session.tool.failed": {
        const messageID = str(data.assistantMessageID);
        if (!messageID || !sessionID) return;
        queueSync(`${sessionID}:${messageID}`, async () => {
          const message = await getMessageById(sessionID, messageID);
          if (!message) return;
          emit({ type: "message.updated", properties: { info: message.info } });
          for (const part of message.parts) {
            emit({ type: "message.part.updated", properties: { part } });
          }
        });
        return;
      }

      case "session.step.ended": {
        const messageID = str(data.assistantMessageID);
        const state = assistants.get(messageID);
        if (state) {
          state.completed = created;
          state.cost = num(data.cost);
          state.tokens = data.tokens as Record<string, unknown>;
          emit({ type: "message.updated", properties: { info: assistantInfo(state) } });
        }
        if (!sessionID) return;
        queueSync(`${sessionID}:sync`, async () => {
          const message = messageID ? await getMessageById(sessionID, messageID) : null;
          if (message) {
            emit({ type: "message.updated", properties: { info: message.info } });
            for (const part of message.parts) {
              emit({ type: "message.part.updated", properties: { part } });
            }
          }
          const diff = await getSessionDiff(sessionID);
          emit({ type: "session.diff", properties: { sessionID, diff } });
        });
        return;
      }

      case "session.retry.scheduled":
        emit({
          type: "session.status",
          properties: {
            sessionID,
            status: {
              type: "retry",
              attempt: num(data.attempt, 1),
              message: str(data.message ?? raw(data.error).message, "Retrying"),
              next: num(data.next, Date.now() + 2000),
            } satisfies SessionStatus,
          },
        });
        return;

      case "session.created":
      case "session.renamed":
      case "session.moved":
      case "session.archived":
      case "session.unarchived":
      case "session.forked": {
        const id = str(data.sessionID, str(data.id, str(raw(data.info).id)));
        if (!id) return;
        queueSync(`session:${id}`, async () => {
          const session = await getSession(id).catch(() => null);
          if (!session) return;
          emit({
            type: type === "session.created" || type === "session.forked"
              ? "session.created"
              : "session.updated",
            properties: { info: session },
          });
        });
        return;
      }

      case "session.deleted": {
        const id = str(data.sessionID, str(data.id, str(raw(data.info).id)));
        if (!id) return;
        emit({
          type: "session.deleted",
          properties: {
            info: {
              id,
              projectID: "",
              title: "",
              version: "",
              time: { created: created, updated: created },
            },
          },
        });
        return;
      }

      case "permission.asked": {
        const request = raw(data.request ?? data.permission ?? data);
        const id = str(request.id, str(data.requestID));
        const permissionSessionID = str(request.sessionID, sessionID);
        if (!id || !permissionSessionID) return;
        const resources = arr(request.resources).map((item) => str(item));
        const action = str(request.action, "tool");
        emit({
          type: "permission.updated",
          properties: {
            id,
            sessionID: permissionSessionID,
            messageID: str(request.messageID),
            type: action,
            pattern: resources.length ? resources : undefined,
            title: str(request.title, str(request.message, `Allow ${action}`)),
            metadata: {
              ...raw(request.metadata),
              source: request.source,
              message: request.message,
            },
            time: { created },
          },
        });
        return;
      }

      case "permission.replied": {
        emit({
          type: "permission.replied",
          properties: {
            sessionID,
            permissionID: str(data.requestID, str(data.id, str(data.permissionID))),
            response: str(data.decision, "once"),
          },
        });
        return;
      }

      case "session.synthetic":
        emit({
          type: "session.synthetic",
          properties: {
            sessionID,
            messageID: str(data.messageID),
          },
        });
        return;

      case "session.compaction.ended":
      case "session.compaction.failed":
        emit({ type: "session.compacted", properties: { sessionID } });
        return;

      case "vcs.branch.updated":
        emit({
          type: "vcs.branch.updated",
          properties: { branch: str(data.branch) || undefined },
        });
        return;

      case "filesystem.changed":
        emit({
          type: "file.edited",
          properties: { file: str(data.path ?? data.file) },
        });
        return;

      default:
        return;
    }
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
