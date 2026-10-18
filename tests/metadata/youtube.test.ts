// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { youtubeDurationSeconds, youtubeVideoId } from "../../lib/metadata/youtube-input";
import { youtubeProvider } from "../../lib/metadata/youtube-transport";
import { lookupMetadata } from "../../lib/metadata/lookup";

const id = "YtFixture01";
// SYNTHETIC / DOCUMENTED-NOT-LIVE-TESTED response, no real captured payload/key.
const video = () => ({ id, snippet: { title: "Synthetic video", liveBroadcastContent: "none", thumbnails: { high: { url: "https://example.invalid/cover.jpg" } } }, contentDetails: { duration: "PT24M" }, status: { privacyStatus: "public", uploadStatus: "processed" } });
const now = () => new Date("2026-10-16T12:00:00Z");
type Transport = typeof fetch;
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
async function lookup(transport: Transport, options: { apiKey?: string; timeoutMs?: number; signal?: AbortSignal } = {}) {
  return lookupMetadata(youtubeProvider({ apiKey: randomUUID(), transport, ...options }), { kind: "detail", externalId: id }, { now, signal: options.signal });
}
const success = (value: unknown = video()): Transport => async () => response({ items: [value] });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(["youtube.com", "www.youtube.com", "m.youtube.com"])("accepts watch/shorts on exact %s host with ordinary tracking/timestamps", host => {
  expect(youtubeVideoId(`https://${host}/watch?v=${id}&t=30&list=tracking&si=ordinary#t=2`)).toBe(id);
  expect(youtubeVideoId(`https://${host}/shorts/${id}?t=12`)).toBe(id);
});
it("accepts canonical ID and short link, ignoring tracking", () => {
  expect(youtubeVideoId(id)).toBe(id);
  expect(youtubeVideoId(`https://youtu.be/${id}?si=ordinary&t=2`)).toBe(id);
});
it.each([
  `http://youtube.com/watch?v=${id}`, `https://youtube.com.evil.invalid/watch?v=${id}`, `https://evil.youtube.com/watch?v=${id}`,
  `https://youtube.com:443/watch?v=${id}`, `https://youtube.com:123/watch?v=${id}`, `https://u:p@youtube.com/watch?v=${id}`,
  `https://youtube.com/watch?v=${id}&v=${id}`, `https://youtube.com/watch?v=${id}&%76=${id}`, "https://youtube.com/watch?v=bad", "https://youtube.com/watch",
  `https://youtube.com/watch/extra?v=${id}`, `https://youtube.com/shorts/${id}/extra`, `https://youtu.be/${id}/extra`, `https://youtu.be/${id}?v=${id}`,
  "https://youtube.com/playlist?list=abc", "https://youtube.com/channel/abc", `https://youtube.com/a/../watch?v=${id}`, `https://youtube.com/%2e/watch?v=${id}`,
  `https://youtube.com/\\watch?v=${id}`, `https://youtube.com/watch?v=${id}\n`, "", "not a link",
])("rejects unsupported or malformed single-video input without fetching it", input => expect(youtubeVideoId(input)).toBeNull());
it.each([["PT1S", 1], ["PT24M", 1440], ["PT1H2M3S", 3723], ["P1D", 86400], ["P1DT0H0M0S", 86400]])("parses integral ISO duration %s losslessly", (input, expected) => expect(youtubeDurationSeconds(input)).toBe(expected));
it.each([null, "PT0S", "P", "PT", "P1DT", "PT1.5S", "-PT1S", "P1M", "P1W", "P2D", "PT86401S", "PT1M1H", "PTInfinityS", "PT999999999999999999999H"])("unknown/unbounded ISO duration %s is null", input => expect(youtubeDurationSeconds(input)).toBeNull());
it("constructs one fixed official request, with key only in header, no redirects/cache/credentials", async () => {
  const credential = randomUUID();
  const transport: Transport = async (input, init) => {
    const url = new URL(String(input));
    // Assert booleans only so a failing test never serializes request credentials.
    expect(url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/videos").toBe(true);
    expect(url.searchParams.get("id") === id).toBe(true);
    expect(url.searchParams.get("part") === "snippet,contentDetails,status,liveStreamingDetails").toBe(true);
    expect(!url.href.includes(credential) && !url.searchParams.has("key")).toBe(true);
    expect(new Headers(init?.headers).get("X-Goog-Api-Key") === credential).toBe(true);
    expect(init?.redirect === "error" && init.cache === "no-store" && init.credentials === "omit").toBe(true);
    return response({ items: [video()] });
  };
  const result = await lookup(transport, { apiKey: credential });
  expect(JSON.stringify(result).includes(credential)).toBe(false);
  expect(result).toMatchObject({ kind: "available", item: { title: "Synthetic video", contentType: "youtube", duration: { seconds: 1440, meaning: "full_item" }, genres: [], sourceUrl: `https://www.youtube.com/watch?v=${id}`, watchUrl: `https://www.youtube.com/watch?v=${id}`, requirements: ["review_metadata", "choose_moods"], provenance: { retrievedAt: now().toISOString(), freshness: { refreshBy: "2026-11-15T12:00:00.000Z" } } } });
});
it("missing configuration, malformed detail IDs and URL-like search never fetch", async () => {
  let calls = 0;
  const transport: Transport = async () => { calls++; throw new Error("Unexpected transport"); };
  for (const apiKey of [undefined, "", "   ", "bad\nvalue"]) expect(await lookup(transport, { apiKey })).toMatchObject({ code: "not_configured" });
  const provider = youtubeProvider({ apiKey: randomUUID(), transport });
  expect(await provider.lookup({ kind: "detail", externalId: "bad" }, {})).toMatchObject({ code: "invalid_query" });
  expect(await provider.lookup({ kind: "search", text: "https://foreign.invalid/watch" }, {})).toMatchObject({ code: "invalid_query" });
  expect(calls).toBe(0);
});
it("missing title/unsafe thumbnail and unknown runtime remain editable incomplete suggestions", async () => {
  const value = video();
  const result = await lookup(success({ ...value, snippet: { liveBroadcastContent: "none", thumbnails: { high: { url: "https://u:p@example.invalid/cover" } } }, contentDetails: {} }));
  expect(result).toMatchObject({ kind: "incomplete", item: { title: null, coverUrl: null, duration: { seconds: null }, manualFields: ["title", "duration"] } });
});
it.each(["live", "upcoming", "unknown", undefined])("live/uncertain broadcast status %s never trusts provisional finite runtime", async liveBroadcastContent => {
  expect(await lookup(success({ ...video(), snippet: { ...video().snippet, liveBroadcastContent } }))).toMatchObject({ kind: "incomplete", item: { duration: { seconds: null }, manualFields: ["duration"] } });
});
it("unfinished/missing live details stay uncertain, completed broadcast may use finite duration", async () => {
  for (const liveStreamingDetails of [{ actualStartTime: now().toISOString() }, {}, null, { actualEndTime: "1" }, { actualEndTime: "not a timestamp" }]) expect(await lookup(success({ ...video(), liveStreamingDetails }))).toMatchObject({ kind: "incomplete", item: { duration: { seconds: null } } });
  expect(await lookup(success({ ...video(), liveStreamingDetails: { actualEndTime: "2026-10-15T12:00:00Z" } }))).toMatchObject({ kind: "available", item: { duration: { seconds: 1440 } } });
});
it.each([{ items: [] }, { items: [{ ...video(), status: { privacyStatus: "private" } }] }, { items: [{ ...video(), status: { uploadStatus: "deleted" } }] }])("unavailable videos return indistinguishable safe failure", async ({ items }) => {
  expect(await lookup(async () => response({ items }))).toMatchObject({ kind: "failure", code: "not_found_or_inaccessible" });
});
it.each([{}, { items: null }, { items: [{ ...video(), id: "YtFixture02" }] }, { items: [video(), video()] }])("unusable envelope/mismatched identity cannot become trusted metadata", async body => {
  expect(await lookup(async () => response(body))).toMatchObject({ kind: "failure", code: "invalid_metadata" });
});
it.each([
  [400, "keyInvalid", "not_configured"], [401, "authError", "not_configured"], [403, "forbidden", "not_configured"],
  [403, "quotaExceeded", "quota_exhausted"], [403, "dailyLimitExceeded", "quota_exhausted"], [403, "rateLimitExceeded", "rate_limited"],
  [429, "", "rate_limited"], [404, "videoNotFound", "not_found_or_inaccessible"], [500, "", "provider_error"], [503, "", "provider_error"], [302, "", "provider_error"],
])("HTTP %s reason %s maps safely to %s", async (status, reason, code) => {
  const result = await lookup(async () => response({ error: { message: "redacted internal body", errors: [{ reason }] } }, status as number, { "Retry-After": "20" }));
  expect(result).toMatchObject({ kind: "failure", code, retryAfterSeconds: code === "rate_limited" ? 20 : null });
  expect(JSON.stringify(result)).not.toMatch(/internal body|errors|reason/);
});
it.each(["-1", "1.5", "86401", "Wed, 21 Oct 2026 07:28:00 GMT"])("unsupported Retry-After %s is not guessed", async value => {
  expect(await lookup(async () => response({}, 429, { "Retry-After": value }))).toMatchObject({ code: "rate_limited", retryAfterSeconds: null });
});
it("malformed JSON success and bodyless status failures have safe outcomes", async () => {
  expect(await lookup(async () => new Response("invalid", { status: 200 }))).toMatchObject({ code: "invalid_metadata" });
  expect(await lookup(async () => new Response(null, { status: 401 }))).toMatchObject({ code: "not_configured" });
});
it("network diagnostics and credential values never enter returned results or console logs", async () => {
  const key = randomUUID();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await lookup(async () => { throw new Error(key); }, { apiKey: key });
  expect(JSON.stringify(result).includes(key)).toBe(false);
  expect(result).toMatchObject({ code: "network_error" });
  expect(log.mock.calls.length + error.mock.calls.length + warn.mock.calls.length).toBe(0);
  const echoed = await lookup(success({ ...video(), snippet: { ...video().snippet, title: key } }), { apiKey: key });
  expect(JSON.stringify(echoed).includes(key)).toBe(false);
  expect(echoed).toMatchObject({ code: "invalid_metadata" });
});
it("caller abort is distinct from owned timeout and neither waits for uncooperative transport", async () => {
  const controller = new AbortController();
  let transportSignal: AbortSignal | null | undefined;
  let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
  const transport: Transport = async (_input, init) => { transportSignal = init?.signal;started(); return new Promise(() => {}); };
  const pending = lookup(transport, { signal: controller.signal });
  await ready;
  controller.abort();
  expect(await pending).toMatchObject({ code: "cancelled" });
  expect(transportSignal?.aborted).toBe(true);
  vi.useFakeTimers();
  const timeout = lookup(transport, { timeoutMs: 15 });
  await vi.advanceTimersByTimeAsync(16);
  expect(await timeout).toMatchObject({ code: "timeout" });
  expect(transportSignal?.aborted).toBe(true);
});
it("timeout also bounds stalled response-body parsing", async () => {
  const transport: Transport = async () => new Response(new ReadableStream({pull(){return new Promise(()=>{});}}));
  expect(await lookup(transport, { timeoutMs: 5 })).toMatchObject({ code: "timeout" });
});
