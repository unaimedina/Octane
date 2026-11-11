import type { Project, Session } from "./types";

export function normalizeProjectDirectory(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isAbsoluteProjectDirectory(value: string): boolean {
  const normalized = normalizeProjectDirectory(value);
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/");
}

export function projectSessions(project: Project, sessions: Session[]): Session[] {
  const target = normalizeProjectDirectory(project.directory).toLowerCase();
  return sessions.filter(
    (session) =>
      session.directory &&
      normalizeProjectDirectory(session.directory).toLowerCase() === target,
  );
}
