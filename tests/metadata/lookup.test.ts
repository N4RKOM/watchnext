import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupFailure, lookupMetadata, providerIdentity } from "../../lib/metadata/lookup";
import type { FailureCode, ItemProjection, LookupQuery, MetadataProvider, ProviderReply } from "../../lib/metadata/types";
import { ambiguous, episodic, fixtureStatus, youtube } from "./fixtures";
import { validateManualTitle } from "../../lib/title-validation";
import type { SaveInput } from "../../lib/shared-save";

const now = () => new Date("2026-10-16T12:00:00.000Z");
function fake(reply: ProviderReply, namespace: MetadataProvider["namespace"] = "youtube"): MetadataProvider {
  return { namespace, lookup: vi.fn(async () => reply) };
}
async function detail(raw: ItemProjection = youtube, namespace: MetadataProvider["namespace"] = "youtube") {
  return lookupMetadata(fake({ kind: "item", item: raw }, namespace), { kind: "detail", externalId: String(raw.externalId) }, { now });
}
afterEach(() => vi.restoreAllMocks());
describe("offline normalized metadata contract", () => {
  it("complete synthetic YouTube metadata still requires review/moods, with bounded freshness", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    const result = await detail();
    expect(fixtureStatus).toBe("synthetic/documented-not-live-tested");
    expect(result.kind).toBe("available");
    if (result.kind !== "available") throw new Error("Expected item");
    expect(result.item.duration).toEqual({ seconds: 1440, meaning: "full_item" });
    expect(result.item.requirements).toEqual(["review_metadata", "choose_moods"]);
    expect(result.item.provenance).toMatchObject({ origin: "provider_suggestions", retrievedAt: now().toISOString(), freshness: { refreshBy: "2026-11-15T12:00:00.000Z", action: "refresh_or_delete" } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("incomplete episodic Kinopoisk metadata never guesses runtime, numbering, anime or playability", async () => {
    const result = await detail(episodic, "kinopoisk_unofficial");
    expect(result.kind).toBe("incomplete");
    if (result.kind !== "incomplete") throw new Error("Expected incomplete");
    expect(result.item).toMatchObject({ contentType: "series", duration: { seconds: null, meaning: "typical_episode" }, watchUrl: null, manualFields: ["duration"], requirements: ["review_metadata", "choose_moods", "choose_numbering", "confirm_typical_episode_duration"] });
    expect(result.item.provenance.freshness).toEqual({ policy: "provider_policy_unverified", refreshBy: null, action: "verify_policy_before_persistence" });
  });
  it("ambiguous search returns only candidate projections; selection requires a separate detail request", async () => {
    const provider = fake({ kind: "search", candidates: ambiguous }, "kinopoisk_unofficial");
    const result = await lookupMetadata(provider, { kind: "search", text: " Synthetic title " });
    expect(result.kind).toBe("candidates");
    if (result.kind !== "candidates") throw new Error("Expected candidates");
    expect(result.candidates).toHaveLength(2);
    expect(Object.keys(result.candidates[0]).sort()).toEqual(["identity", "title", "year", "contentType", "coverUrl"].sort());
    expect(result.requiresSelection).toBe(true);
    expect(provider.lookup).toHaveBeenCalledTimes(1);
    expect(provider.lookup).toHaveBeenCalledWith({ kind: "search", text: "Synthetic title" }, { signal: undefined });
  });
  it("empty search is an honest no-match, while invalid identities cannot become candidates", async () => {
    expect(await lookupMetadata(fake({ kind: "search", candidates: [] }), { kind: "search", text: "none" })).toEqual({ kind: "no_match", candidates: [], manualFallback: true });
    const query: LookupQuery = { kind: "search", text: "title" };
    expect(await lookupMetadata(fake({ kind: "search", candidates: [{ ...youtube, externalId: "bad" }] }), query)).toMatchObject({ kind: "failure", code: "invalid_metadata" });
    expect(await lookupMetadata(fake({ kind: "search", candidates: [youtube, { externalId: "bad" }] }), query)).toMatchObject({ kind: "candidates", omittedInvalidCandidates: true });
  });
  it.each([null, 0, -1, 1.5, Infinity, "PT24M", 86401])("unknown/unsupported duration %s remains null without rounding or defaults", async seconds => {
    expect(await detail({ ...youtube, duration: { seconds, meaning: "full_item", verified: true } })).toMatchObject({ kind: "incomplete", item: { duration: { seconds: null }, manualFields: ["duration"] } });
  });
  it("unverified runtime and a series total cannot masquerade as a verified typical episode", async () => {
    for (const duration of [{ seconds: 1440, meaning: "full_item", verified: false }, { seconds: 1440, meaning: "full_item", verified: true }]) {
      expect(await detail({ ...episodic, duration }, "kinopoisk_unofficial")).toMatchObject({ kind: "incomplete", item: { duration: { seconds: null } } });
    }
    expect(await detail({ ...episodic, duration: { seconds: 1440, meaning: "typical_episode", verified: true } }, "kinopoisk_unofficial")).toMatchObject({ kind: "available", item: { requirements: ["review_metadata", "choose_moods", "choose_numbering", "confirm_typical_episode_duration"] } });
  });
  it("strict canonical IDs reject aliases, numbers, padded or malformed IDs before calling the adapter", async () => {
    for (const id of ["bad", " YtFixture01", "https://youtu.be/YtFixture01"]) {
      const provider = fake({ kind: "item", item: youtube });
      expect(await lookupMetadata(provider, { kind: "detail", externalId: id })).toMatchObject({ code: "invalid_query" });
      expect(provider.lookup).not.toHaveBeenCalled();
    }
    for (const id of [0, 1002, "0", "01002", "-1", "1.5", "12345678901234567890"]) expect(providerIdentity("kinopoisk_unofficial", id)).toBeNull();
    expect(await lookupMetadata(fake({ kind: "item", item: { ...youtube, externalId: "YtFixture02" } }), { kind: "detail", externalId: "YtFixture01" })).toMatchObject({ code: "invalid_metadata" });
  });
  it.each(["javascript:alert(1)", "https://user:secret@example.invalid/", "https://example.invalid/?api_key=secret", "https://example.invalid/#secret", "https://example.invalid/a b", "https://example.invalid/\\evil"])("unsafe/credential-bearing URL is removed: %s", async url => {
    expect(await detail({ ...youtube, sourceUrl: url, watchUrl: url, coverUrl: url })).toMatchObject({ kind: "incomplete", item: { sourceUrl: null, watchUrl: null, coverUrl: null } });
  });
  it("unknown/uncertain types and fields stay incomplete; optional absence permits manual completion", async () => {
    expect(await detail({ ...youtube, title: "x".repeat(201), contentType: "FILM" })).toMatchObject({ kind: "incomplete", item: { title: null, contentType: null, duration: { seconds: null }, manualFields: ["title", "contentType", "duration"] } });
    expect(await detail({ ...youtube, uncertainFields: ["title", "duration", "watchUrl", "genres"] })).toMatchObject({ kind: "incomplete", item: { title: null, watchUrl: null, genres: [], duration: { seconds: null } } });
    expect(await detail({ ...youtube, watchUrl: null })).toMatchObject({ kind: "available", item: { manualFields: [], watchUrl: null, sourceUrl: null, coverUrl: null } });
  });
  it("genres are optional, trimmed/deduplicated and bounded without silent truncation", async () => {
    expect(await detail({ ...youtube, genres: [" Comedy ", "comedy", "Drama"] })).toMatchObject({ item: { genres: ["Comedy", "Drama"] } });
    expect(await detail({ ...youtube, genres: Array(11).fill("Comedy") })).toMatchObject({ kind: "incomplete", item: { genres: [] } });
    expect(await detail({ ...youtube, genres: ["x".repeat(41), "Drama"] })).toMatchObject({ kind: "incomplete", item: { genres: ["Drama"] } });
  });
  it("reviewed normalized fields fit the existing save contract only after explicit mood completion", async () => {
    const result = await detail();
    if (result.kind !== "available") throw new Error("Expected item");
    const item = result.item;
    const seconds = item.duration.seconds!;
    const input: Extract<SaveInput, { kind: "provider" }> = { kind: "provider", provider: { ...item.identity, sourceUrl: item.sourceUrl, coverUrl: item.coverUrl }, fields: {
      title: item.title, contentType: item.contentType, minutes: String(Math.floor(seconds / 60)), seconds: String(seconds % 60), numberingStyle: "none", genres: item.genres.join(","), moods: [], watchUrl: item.watchUrl ?? "",
    } };
    expect(() => validateManualTitle(input.fields)).toThrow("Choose at least one");
    input.fields.moods = ["funny"];
    expect(validateManualTitle(input.fields)).toMatchObject({ durationSeconds: 1440, contentType: "youtube", moods: ["funny"] });
    // Type-only SaveInput import: no save service, session or database is invoked.
  });
  it("duration endpoints are lossless and invalid optional years are recorded", async () => {
    for (const seconds of [1, 86400]) expect(await detail({ ...youtube, duration: { seconds, meaning: "full_item", verified: true } })).toMatchObject({ kind: "available", item: { duration: { seconds } } });
    expect(await detail({ ...youtube, year: 2026.5 })).toMatchObject({ kind: "incomplete", item: { year: null, issues: [{ field: "year", reason: "invalid" }] } });
  });
  it("whitelists results: no moods, history, personal data, raw payload or supplied provenance", async () => {
    const raw = { ...youtube, moods: ["funny"], history: "private", notes: "private", apiKey: "secret-marker", raw: { authorization: "secret-marker" }, provenance: { retrievedAt: "forever" } };
    const result = await detail(raw);
    expect(JSON.stringify(result)).not.toMatch(/private|secret-marker|forever|"moods"|"history"|"notes"|"raw"/);
    expect(result).toMatchObject({ item: { provenance: { acquiredFields: ["title", "contentType", "duration", "watchUrl"] } } });
  });
  it.each(["invalid_query", "not_found_or_inaccessible", "not_configured", "quota_exhausted", "rate_limited", "network_error", "timeout", "provider_error", "invalid_metadata", "cancelled"] as FailureCode[])("stable %s failure has safe message and explicit recovery", async code => {
    const result = await lookupMetadata(fake({ kind: "failure", code, retryAfterSeconds: 10 }), { kind: "detail", externalId: "YtFixture01" });
    expect(result).toEqual(lookupFailure(code, 10));
    expect(result).toMatchObject({ kind: "failure", code, manualFallback: true });
    const retries = { invalid_query: "never", invalid_metadata: "never", not_found_or_inaccessible: "user", not_configured: "after_configuration", quota_exhausted: "after_provider_reset", rate_limited: "after_delay", network_error: "user", timeout: "user", provider_error: "user", cancelled: "user" };
    expect(result).toMatchObject({ retry: retries[code], retryAfterSeconds: code === "rate_limited" ? 10 : null });
    expect(lookupFailure(code, Infinity).retryAfterSeconds).toBeNull();
  });
  it("exceptions/invalid input/cancellation are safe and never echo provider diagnostics", async () => {
    const provider: MetadataProvider = { namespace: "youtube", lookup: vi.fn(async () => { throw new Error("Authorization secret-marker internal stack"); }) };
    expect(await lookupMetadata(provider, { kind: "detail", externalId: "YtFixture01" })).toEqual(lookupFailure("provider_error"));
    const controller = new AbortController(); controller.abort();
    expect(await lookupMetadata(provider, { kind: "search", text: "title" }, { signal: controller.signal })).toEqual(lookupFailure("cancelled"));
    expect(await lookupMetadata(provider, { kind: "search", text: "\u0000" })).toEqual(lookupFailure("invalid_query"));
    expect(await detail({ ...youtube, title: "safe" })).not.toHaveProperty("moods");
    expect(await lookupMetadata(fake({ kind: "failure", code: "secret-marker" as FailureCode }), { kind: "detail", externalId: "YtFixture01" })).toEqual(lookupFailure("provider_error"));
    expect(await lookupMetadata(fake({ kind: "item", item: youtube }), { kind: "detail", externalId: "YtFixture01" }, { now: () => new Date(NaN) })).toEqual(lookupFailure("provider_error"));
  });
  it("cancellation during adapter work discards results without exposing provider details", async () => {
    const controller = new AbortController();
    const provider: MetadataProvider = { namespace: "youtube", lookup: async (_query, { signal }) => {
      expect(signal).toBe(controller.signal); controller.abort(); return { kind: "item", item: youtube };
    } };
    expect(await lookupMetadata(provider, { kind: "detail", externalId: "YtFixture01" }, { signal: controller.signal })).toEqual(lookupFailure("cancelled"));
  });
});
