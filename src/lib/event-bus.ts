export type BusEvent = {
  type: string;
  properties: Record<string, unknown>;
};

type Listener = (event: BusEvent) => void;

type BusStore = { listeners: Set<Listener> };

const globalStore = globalThis as typeof globalThis & {
  __ocEventBus?: BusStore;
};
const store = (globalStore.__ocEventBus ??= { listeners: new Set() });

export function publishEvent(event: BusEvent): void {
  for (const listener of [...store.listeners]) {
    try {
      listener(event);
    } catch {
      // A broken SSE client must not stop the agent run.
    }
  }
}

export function subscribeEvents(listener: Listener): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}
