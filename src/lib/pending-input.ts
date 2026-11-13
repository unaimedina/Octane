export type PendingItem = { id: string; sessionID: string };
export type ModalPick =
  | { kind: "permission"; id: string }
  | { kind: "question"; id: string };

type Ranked = { pick: ModalPick; order: number; rank: number };

/**
 * Decide which single blocking modal to show, which permission belongs inline in
 * the open session, and which sessions need input. Pure: no React, no SDK.
 */
export function pickPendingInput(input: {
  permissions: PendingItem[];
  questions: PendingItem[];
  openSessionId: string | undefined;
  /** client arrival sequence per item id; missing ids sort last, by list order */
  arrival: Record<string, number>;
  /** id of the modal currently on screen, if any (stickiness) */
  shownId: string | null;
}): {
  modal: ModalPick | null;
  /** other modal candidates not on screen */
  waiting: number;
  /** open-session permission rendered inline (first by arrival), if any */
  inlinePermissionId: string | null;
  /** sessions that need input (sidebar) */
  needsInput: Set<string>;
} {
  const { permissions, questions, openSessionId, arrival, shownId } = input;
  const rankOf = (id: string) =>
    typeof arrival[id] === "number" ? arrival[id] : Number.POSITIVE_INFINITY;

  const inline = openSessionId
    ? permissions.filter((item) => item.sessionID === openSessionId)
    : [];
  const otherPermissions = openSessionId
    ? permissions.filter((item) => item.sessionID !== openSessionId)
    : permissions;

  // Questions first, then permissions: a stable sort by arrival keeps the list
  // order for ties, so a question and a permission arriving together show the
  // question. Items without a stamp sort last and keep their list order.
  const ordered: ModalPick[] = [
    ...questions.map((item) => ({ kind: "question" as const, id: item.id })),
    ...otherPermissions.map((item) => ({ kind: "permission" as const, id: item.id })),
  ];
  const candidates: Ranked[] = ordered.map((pick, order) => ({
    pick,
    order,
    rank: rankOf(pick.id),
  }));
  candidates.sort((a, b) => (a.rank === b.rank ? a.order - b.order : a.rank - b.rank));

  const sticky = shownId
    ? (candidates.find((item) => item.pick.id === shownId)?.pick ?? null)
    : null;
  const modal = sticky ?? candidates[0]?.pick ?? null;

  const inlinePermissionId =
    inline.length > 0
      ? inline.reduce((earliest, item) =>
          rankOf(item.id) < rankOf(earliest.id) ? item : earliest,
        ).id
      : null;

  const needsInput = new Set<string>();
  for (const item of permissions) needsInput.add(item.sessionID);
  for (const item of questions) needsInput.add(item.sessionID);

  return {
    modal,
    waiting: Math.max(0, candidates.length - (modal ? 1 : 0)),
    inlinePermissionId,
    needsInput,
  };
}
