"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * A slot in the app top bar that pages can render into.
 *
 * AppShell renders <TopBarSlotProvider> around the layout and puts
 * <TopBarSlotTarget /> in the top bar. Any page can render
 * <TopBarActions>…</TopBarActions>; it portals into the target, so page-owned
 * state (e.g. the open session's controls) never has to be lifted into the shell.
 */

type SlotContext = {
  target: HTMLElement | null;
  setTarget: (element: HTMLElement | null) => void;
};

const TopBarSlotContext = React.createContext<SlotContext | null>(null);

export function TopBarSlotProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ target, setTarget }), [target]);
  return <TopBarSlotContext.Provider value={value}>{children}</TopBarSlotContext.Provider>;
}

export function TopBarSlotTarget({ className }: { className?: string }) {
  const context = React.useContext(TopBarSlotContext);
  const setTarget = context?.setTarget;
  const ref = React.useCallback((element: HTMLDivElement | null) => setTarget?.(element), [setTarget]);
  return <div ref={ref} className={className} />;
}

export function TopBarActions({ children }: { children: React.ReactNode }) {
  const context = React.useContext(TopBarSlotContext);
  if (!context?.target) return null;
  return createPortal(children, context.target);
}
