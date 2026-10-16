/** Shared writer/read-boundary validation; never turns source metadata into playback. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string" || /[\p{Cc}\s\\]/u.test(value) || !/^https?:\/\/[^/?#]+/i.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
