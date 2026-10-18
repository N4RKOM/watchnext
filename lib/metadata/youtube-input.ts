import { providerIdentity } from "./lookup";
import type { LookupQuery } from "./types";

/** Explicit search intent; old string callers remain strict ID/link-only. */
export function youtubeLookupQuery(value: unknown): LookupQuery | null {
  if(typeof value==="string"){const id=youtubeVideoId(value);return id?{kind:"detail",externalId:id}:null;}
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some(key=>key!=="kind"&&key!=="text"))return null;
  if(input.kind!=="title"||typeof input.text!=="string"||/[\p{Cc}]/u.test(input.text))return null;
  const text=input.text.trim();
  if(!text||[...text].length>200||/^(?:[a-z][a-z\d+.-]*:\/\/|https?:|ftp:|file:|data:|javascript:|\/\/|(?:www\.|m\.)?(?:youtube\.com|youtu\.be)(?:[\/:?#]|$))/i.test(text))return null;
  const id=youtubeVideoId(text);return id?{kind:"detail",externalId:id}:{kind:"search",text};
}

/** Only the listed single-video forms; never a network destination. */
export function youtubeVideoId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (providerIdentity("youtube", value)) return value;
  if (/[\p{Cc}\s\\]/u.test(value) || !/^https:\/\/[^/?#]+/i.test(value)) return null;
  try {
    const url = new URL(value);
    // Inspect the original authority too: URL.port normalizes an explicit :443 away.
    const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
    if (!authority || authority.includes(":") || authority.includes("@") || url.username || url.password || url.protocol !== "https:") return null;
    const longHost = ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname);
    if (!longHost && url.hostname !== "youtu.be") return null;
    const originalPath = value.slice(value.indexOf(authority) + authority.length).split(/[?#]/, 1)[0] || "/";
    if (originalPath !== url.pathname) return null;
    const videoParams = url.searchParams.getAll("v");
    let id: string | null = null;
    if (longHost && url.pathname === "/watch") {
      if (videoParams.length !== 1) return null;
      id = videoParams[0];
    } else {
      if (videoParams.length) return null;
      const match = longHost ? /^\/shorts\/([A-Za-z0-9_-]{11})$/.exec(url.pathname) : /^\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
    return providerIdentity("youtube", id)?.externalId ?? null;
  } catch { return null; }
}

/** Supported integral day/hour/minute/second ISO subset; never round or default. */
export function youtubeDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some(part => part !== undefined) || value.endsWith("T")) return null;
  const seconds = Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86400 ? seconds : null;
}
