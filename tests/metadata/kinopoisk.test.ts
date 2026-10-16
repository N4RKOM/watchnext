// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { kinopoiskSearchText, kinopoiskUnofficialId } from "../../lib/metadata/kinopoisk-input";
import { kinopoiskUnofficialProvider } from "../../lib/metadata/kinopoisk-transport";
import { lookupMetadata } from "../../lib/metadata/lookup";
import type { LookupQuery } from "../../lib/metadata/types";

// SYNTHETIC / DOCUMENTED-NOT-LIVE-TESTED. Invented projections, no account/key capture.
const film = () => ({ kinopoiskId: 1001, nameRu: " Synthetic title ", nameOriginal: "Original", nameEn: null, year: 2020, type: "FILM", filmLength: 120, genres: [{ genre: " Drama " }, { genre: "drama" }], webUrl: "https://www.kinopoisk.ru/film/1001/", posterUrl: "https://example.invalid/poster.jpg" });
const now = () => new Date("2026-10-16T12:00:00Z");
const detail: LookupQuery = { kind: "detail", externalId: "1001" };
const search: LookupQuery = { kind: "search", text: "Synthetic title" };
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
type Options = { apiKey?: string; timeoutMs?: number; signal?: AbortSignal };
const mock = (body: unknown): typeof fetch => async () => response(body);
async function lookup(transport: typeof fetch, query: LookupQuery = detail, options: Options = {}) {
  return lookupMetadata(kinopoiskUnofficialProvider({ apiKey: randomUUID(), transport, ...options }), query, { now, signal: options.signal });
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("first-page ambiguous search keeps distinct candidates and requires explicit separate selection", async () => {
  const key = randomUUID(); let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    expect(url.origin === "https://kinopoiskapiunofficial.tech" && url.pathname === "/api/v2.2/films").toBe(true);
    expect(url.searchParams.get("keyword") === "Игра & title" && url.searchParams.get("page") === "1" && [...url.searchParams.keys()].length === 2).toBe(true);
    expect(!url.href.includes(key)).toBe(true);
    expect(new Headers(init?.headers).get("X-API-KEY") === key).toBe(true);
    expect(init?.redirect === "error" && init.cache === "no-store" && init.credentials === "omit").toBe(true);
    return response({ total: 50, totalPages: 3, items: [film(), film(), { ...film(), kinopoiskId: 1002, year: 2001, type: "TV_SERIES" }] });
  };
  const result = await lookup(transport, { kind: "search", text: "  Игра & title  " }, { apiKey: key });
  expect(JSON.stringify(result).includes(key)).toBe(false);
  expect(result).toMatchObject({ kind: "candidates", requiresSelection: true, candidates: [{ identity: { namespace: "kinopoisk_unofficial", externalId: "1001" }, title: "Synthetic title", contentType: "movie", coverUrl: null }, { identity: { externalId: "1002" }, year: 2001, contentType: "series" }] });
  if (result.kind !== "candidates") throw new Error("Expected candidates");
  expect(result.candidates).toHaveLength(2);
  expect(Object.keys(result.candidates[0]).sort()).toEqual(["identity", "title", "year", "contentType", "coverUrl"].sort());
  expect(calls).toBe(1);
});
it("empty search means no-match, and no detail request happens implicitly", async () => {
  let calls = 0;
  expect(await lookup(async () => { calls++; return response({ items: [] }); }, search)).toEqual({ kind: "no_match", candidates: [], manualFallback: true });
  expect(calls).toBe(1);
});
it("selected numeric provider identity maps losslessly through a fixed detail request", async () => {
  const result = await lookup(async input => {
    const url = new URL(String(input));
    expect(url.href === "https://kinopoiskapiunofficial.tech/api/v2.2/films/1001").toBe(true);
    return response(film());
  });
  expect(result).toMatchObject({ kind: "incomplete", item: { identity: { namespace: "kinopoisk_unofficial", externalId: "1001" }, title: "Synthetic title", year: 2020, contentType: "movie", duration: { seconds: null, meaning: "full_item" }, manualFields: ["duration"], genres: ["Drama"], coverUrl: null, watchUrl: null, sourceUrl: film().webUrl, provenance: { retrievedAt: now().toISOString(), acquiredFields: ["title", "year", "contentType", "genres", "sourceUrl"], freshness: { policy: "provider_policy_unverified", refreshBy: null, action: "verify_policy_before_persistence" } } } });
});
it.each(["TV_SERIES", "MINI_SERIES"])("episodic %s never treats filmLength as typical episode runtime", async type => {
  expect(await lookup(mock({ ...film(), type, filmLength: 2400 }))).toMatchObject({ kind: "incomplete", item: { contentType: "series", duration: { seconds: null, meaning: "typical_episode" }, requirements: ["review_metadata", "choose_moods", "choose_numbering", "confirm_typical_episode_duration"] } });
});
it("anime-related genres do not infer anime, and unsupported types require manual classification", async () => {
  for (const type of ["FILM", "ANIME", "TV_SHOW"]) {
    const result = await lookup(mock({ ...film(), type, genres: [{ genre: "anime" }] }));
    expect(result).toMatchObject({ kind: "incomplete", item: { contentType: type === "FILM" ? "movie" : null, duration: { seconds: null } } });
    expect(JSON.stringify(result)).not.toMatch(/"contentType":"anime"|"moods"|"notes"|"rating"/);
  }
});
it.each(["movie", "series", "anime", "youtube", "film", "tv_series", "TV_SHOW", "ANIME", " FILM ", "UNKNOWN", null, 42, {}])("unsupported raw enums cannot borrow an internal normalized type in detail or candidates", async type => {
  const value = { ...film(), type };
  const result = await lookup(mock(value));
  expect(result).toMatchObject({ kind: "incomplete", item: { contentType: null, duration: { seconds: null, meaning: "unknown" }, manualFields: ["contentType", "duration"] } });
  const candidates = await lookup(mock({ items: [value] }), search);
  expect(candidates).toMatchObject({ kind: "candidates", candidates: [{ contentType: null }] });
});
it("name fallback chooses the first valid name, with all-invalid names explicitly incomplete", async () => {
  expect(await lookup(mock({ ...film(), nameRu: "\u0000bad", nameOriginal: " Original ", nameEn: "English" }))).toMatchObject({ item: { title: "Original" } });
  expect(await lookup(mock({ ...film(), nameRu: "x".repeat(201), nameOriginal: " ", nameEn: " English " }))).toMatchObject({ item: { title: "English" } });
  expect(await lookup(mock({ kinopoiskId: 1001 }))).toMatchObject({ kind: "incomplete", item: { title: null, contentType: null, genres: [], sourceUrl: null, coverUrl: null, watchUrl: null, duration: { seconds: null }, manualFields: ["title", "contentType", "duration"] } });
});
it.each([null, 0, 22, 120, 2400, "2:17", Infinity])("unverified filmLength %s never gains invented units", async filmLength => {
  expect(await lookup(mock({ ...film(), filmLength }))).toMatchObject({ kind: "incomplete", item: { duration: { seconds: null }, manualFields: ["duration"] } });
});
it.each(["javascript:alert(1)", "https://u:p@example.invalid/", "https://example.invalid/?api_key=redacted", "https://example.invalid/\n"])("unsafe source is removed; poster and watch data never grant rights/playability", async webUrl => {
  expect(await lookup(mock({ ...film(), webUrl, watchUrl: "https://example.invalid/watch" }))).toMatchObject({ kind: "incomplete", item: { sourceUrl: null, coverUrl: null, watchUrl: null } });
});
it("malformed optional genres/year are explicit issues, never fabricated values", async () => {
  expect(await lookup(mock({ ...film(), genres: [{ genre: "Drama" }, { genre: "x".repeat(41) }, {}], year: 2020.5 }))).toMatchObject({ kind: "incomplete", item: { genres: ["Drama"], year: null, issues: expect.arrayContaining([{ field: "year", reason: "invalid" }, { field: "genres", reason: "invalid" }]) } });
});
it.each([undefined, null, 5, "", " ", "bad\nquery", "x".repeat(201), "😀".repeat(201)])("invalid search input fails before any fetch/configuration", async value => {
  expect(kinopoiskSearchText(value)).toBeNull();
  let calls = 0;
  const provider = kinopoiskUnofficialProvider({ transport: async () => { calls++; return response({}); } });
  expect(await provider.lookup({ kind: "search", text: value as string }, {})).toMatchObject({ code: "invalid_query" });
  expect(calls).toBe(0);
});
it("query and ID endpoint bounds use code points and canonical exact strings", () => {
  expect(kinopoiskSearchText(" 😀 ")).toBe("😀");
  expect(kinopoiskSearchText("😀".repeat(200))?.length).toBe(400);
  expect(kinopoiskUnofficialId("1")).toBe("1");
  expect(kinopoiskUnofficialId("15000000")).toBe("15000000");
});
it.each(["0", "01", "15000001", "9007199254740993", "-1", "1.5", " 1", "1/../../evil", "https://evil.invalid/1", 1001, null])("invalid/out-of-range detail identity never fetches", async value => {
  expect(kinopoiskUnofficialId(value)).toBeNull();
  let calls = 0;
  const provider = kinopoiskUnofficialProvider({ transport: async () => { calls++; return response({}); } });
  expect(await provider.lookup({ kind: "detail", externalId: value as string }, {})).toMatchObject({ code: "invalid_query" });
  expect(calls).toBe(0);
});
it.each([null, 0, -1, 1.5, "1001", 15000001, 9007199254740992, 1002])("malformed/mismatched provider ID never becomes addressable", async kinopoiskId => {
  expect(await lookup(mock({ ...film(), kinopoiskId }))).toMatchObject({ kind: "failure", code: "invalid_metadata" });
});
it("search filters invalid identities rather than granting arbitrary addresses", async () => {
  expect(await lookup(mock({ items: [{ ...film(), kinopoiskId: "../unsafe" }] }), search)).toMatchObject({ kind: "failure", code: "invalid_metadata" });
  expect(await lookup(mock({ items: [film(), { ...film(), kinopoiskId: 15000001 }] }), search)).toMatchObject({ kind: "candidates", omittedInvalidCandidates: true, candidates: [{ identity: { externalId: "1001" } }] });
});
it.each([undefined, "", " ", "bad\nkey"])("missing/bad configuration returns safe fallback without fetch", async apiKey => {
  let calls = 0;
  expect(await lookup(async () => { calls++; return response(film()); }, detail, { apiKey })).toMatchObject({ code: "not_configured" });
  expect(calls).toBe(0);
});
it.each([[400, "invalid_query"], [401, "not_configured"], [402, "quota_exhausted"], [403, "not_configured"], [404, "not_found_or_inaccessible"], [429, "rate_limited"], [500, "provider_error"], [503, "provider_error"], [302, "provider_error"]])("HTTP %s without JSON maps to %s", async (status, code) => {
  expect(await lookup(async () => new Response("redacted provider message", { status: status as number, headers: { "Retry-After": "20" } }))).toMatchObject({ kind: "failure", code, retryAfterSeconds: status === 429 ? 20 : null });
});
it.each(["-1", "1.5", "86401", "Wed, 21 Oct 2026 07:28:00 GMT"])("unusable Retry-After does not invent a delay", async value => {
  expect(await lookup(async () => response({}, 429, { "Retry-After": value }))).toMatchObject({ code: "rate_limited", retryAfterSeconds: null });
});
it.each([{}, { items: null }, { items: Array(21).fill(film()) }])("unusable successful search payload yields safe error", async body => {
  expect(await lookup(mock(body), search)).toMatchObject({ code: "invalid_metadata" });
});
it("malformed success JSON and network exceptions are distinct safe errors", async () => {
  expect(await lookup(async () => new Response("not json"))).toMatchObject({ code: "invalid_metadata" });
  expect(await lookup(async () => { throw new Error("redacted internal failure"); })).toMatchObject({ code: "network_error" });
});
it("credential, raw bodies and personal fields never reach results or retained diagnostics", async () => {
  const key = randomUUID();
  const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")].map(spy => spy.mockImplementation(() => {}));
  const results = [await lookup(async () => { throw new Error(key); }, detail, { apiKey: key }), await lookup(mock({ ...film(), nameRu: key }), detail, { apiKey: key }), await lookup(mock({ ...film(), apiKey: key, notes: key, description: key }), detail, { apiKey: key })];
  expect(results.every(result => !JSON.stringify(result).includes(key))).toBe(true);
  expect(results[0]).toMatchObject({ code: "network_error" });
  expect(results[1]).toMatchObject({ code: "invalid_metadata" });
  expect(JSON.stringify(results)).not.toMatch(/"notes"|"description"|"apiKey"/);
  expect(logs.reduce((count, spy) => count + spy.mock.calls.length, 0)).toBe(0);
});
it("caller cancellation and owned timeout bound even ignored signals/stalled bodies", async () => {
  const controller = new AbortController(); let signal: AbortSignal | null | undefined;
  const hanging: typeof fetch = async (_input, init) => { signal = init?.signal; return new Promise(() => {}); };
  const request = lookup(hanging, detail, { signal: controller.signal }); controller.abort();
  expect(await request).toMatchObject({ code: "cancelled" });
  expect(signal?.aborted).toBe(true);
  vi.useFakeTimers();
  const timeout = lookup(hanging, detail, { timeoutMs: 5 }); await vi.advanceTimersByTimeAsync(6);
  expect(await timeout).toMatchObject({ code: "timeout" });
  expect(signal?.aborted).toBe(true);
  const body = lookup(async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response, detail, { timeoutMs: 5 });
  await vi.advanceTimersByTimeAsync(6); expect(await body).toMatchObject({ code: "timeout" });
});
