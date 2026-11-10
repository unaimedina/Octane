/** Only allow local absolute paths as a post-login redirect. */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/chat",
): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
