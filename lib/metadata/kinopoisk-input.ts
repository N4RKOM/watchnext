/** Current Unofficial v2.2 endpoint bounds, not another provider's identity range. */
export function kinopoiskUnofficialId(value: unknown): string | null {
  return typeof value === "string" && /^[1-9][0-9]{0,7}$/.test(value) && Number(value) <= 15000000 ? value : null;
}
export function kinopoiskSearchText(value: unknown): string | null {
  if (typeof value !== "string" || /\p{Cc}/u.test(value)) return null;
  const text = value.trim();
  return text && [...text].length <= 200 ? text : null;
}
