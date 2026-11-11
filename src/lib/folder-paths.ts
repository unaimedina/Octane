import { normalizeProjectDirectory } from "./project-paths.ts";

const DRIVE_ROOT = /^[A-Za-z]:$/;

/** "/a/b/" → "/a/b", "C:\\x\\" → "C:/x", "/" stays "/", "C:/" stays "C:/". */
export function cleanPath(value: string): string {
  const raw = value.trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^\/+$/.test(raw)) return "/";
  const normalized = normalizeProjectDirectory(raw);
  if (!normalized) return "/";
  if (DRIVE_ROOT.test(normalized)) return `${normalized}/`;
  return normalized;
}

function splitRoot(value: string): { root: string; rest: string[] } {
  const drive = /^([A-Za-z]:)(\/|$)/.exec(value);
  if (drive) {
    return {
      root: `${drive[1]}/`,
      rest: value.slice(drive[0].length).split("/").filter(Boolean),
    };
  }
  if (value.startsWith("/")) {
    return { root: "/", rest: value.split("/").filter(Boolean) };
  }
  return { root: "", rest: value.split("/").filter(Boolean) };
}

function isAbsoluteClean(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function join(root: string, segments: string[]): string {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return root + out.join("/");
}

/** Absolute paths are returned cleaned; relative ones are joined onto `base`
 *  (also cleaned), resolving "." and ".." segments. Empty value → base.
 *  Returns "" when value is relative and base is empty. */
export function resolveAgainst(base: string, value: string): string {
  const cleanBase = cleanPath(base);
  const cleanValue = cleanPath(value);
  if (!cleanValue) return cleanBase;
  if (isAbsoluteClean(cleanValue)) {
    const { root, rest } = splitRoot(cleanValue);
    return join(root, rest);
  }
  if (!cleanBase) return "";
  const { root, rest } = splitRoot(cleanBase);
  return join(root, [...rest, ...cleanValue.split("/").filter(Boolean)]);
}

/** Parent of an absolute path; "/" for "/x"; "/" for "/"; "C:/" for "C:/x". */
export function parentPath(value: string): string {
  const cleaned = cleanPath(value);
  if (!cleaned) return "";
  const { root, rest } = splitRoot(cleaned);
  if (!root) {
    return rest.slice(0, -1).join("/");
  }
  return join(root, rest.slice(0, -1));
}

/** Breadcrumb segments of an absolute path, each with the path up to it. */
export function pathSegments(value: string): { label: string; path: string }[] {
  const cleaned = cleanPath(value);
  if (!cleaned) return [];
  const { root, rest } = splitRoot(cleaned);
  const result: { label: string; path: string }[] = [];
  if (root) {
    result.push({
      label: root === "/" ? "/" : root.slice(0, -1),
      path: root,
    });
  }
  rest.forEach((segment, index) => {
    result.push({ label: segment, path: join(root, rest.slice(0, index + 1)) });
  });
  return result;
}
