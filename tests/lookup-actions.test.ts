// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import type { Providers } from "../lib/metadata/reviews";
let db: DatabaseSync, request: Request, cookie: string, providers: Providers, calls: number;
const origin = "https://watch.example";
vi.mock("../db/server", () => ({ getDatabase: () => db }));
vi.mock("../lib/access", () => ({ getGroupRequest: async () => request }));
vi.mock("../lib/metadata/providers", () => ({ configuredMetadataProviders: () => providers }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { lookupTitleAction, selectCandidateAction } from "../app/watchlist/add/lookup-actions";
import { saveTitleAction } from "../app/watchlist/add/actions";
import { refreshMetadataAction } from "../app/watchlist/refresh-actions";
const form = (values: Record<string, string>) => { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; };
beforeEach(() => {
  vi.stubEnv("WATCHNEXT_APP_ORIGIN", origin); db = new DatabaseSync(":memory:"); migrate(db); calls = 0;
  cookie = acceptInvitation(db, createGroup(db, "Action fixture", origin).inviteUrl.split("/").at(-1)!);
  request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } });
  changeProfile(db, request, { intent: "create", name: "Anna", color: "#1d4ed8" }, origin);
  providers = { youtube: { namespace: "youtube", lookup: async () => { calls++; return { kind: "item", item: { externalId: "YtFixture01", title: "Synthetic action video", contentType: "youtube", duration: { seconds: 120, verified: true, meaning: "full_item" }, watchUrl: "https://www.youtube.com/watch?v=YtFixture01" } }; } }, kinopoisk_unofficial: { namespace: "kinopoisk_unofficial", lookup: async () => ({ kind: "search", candidates: [] }) } };
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
it("real lookup/save actions trust server snapshot identity rather than arbitrary provider/provenance form fields", async () => {
  const result = await lookupTitleAction(form({ source: "youtube", query: "https://youtu.be/YtFixture01" })); expect(result.kind).toBe("available"); expect(calls).toBe(1);
  expect(db.prepare("SELECT * FROM titles").all()).toEqual([]);
  const input = form({ reviewHandle: result.handle!, title: "Synthetic action video", contentType: "youtube", minutes: "2", seconds: "0", numberingStyle: "none", genres: "", moods: "funny", watchUrl: "https://www.youtube.com/watch?v=YtFixture01", sourceUrl: "", coverUrl: "", providerNamespace: "forged", providerId: "forged", provenance: "forged", intent: "save" });
  await expect(saveTitleAction({ kind: "idle" }, input)).rejects.toThrow("REDIRECT:/watchlist/add?saved=");
  expect(db.prepare("SELECT provider_namespace,provider_id,title FROM titles").get()).toMatchObject({ provider_namespace: "youtube", provider_id: "YtFixture01", title: "Synthetic action video" });
  expect(db.prepare("SELECT origin FROM metadata_fields WHERE field='title'").get()?.origin).toBe("provider");
  const replay = await saveTitleAction({ kind: "idle" }, input); expect(replay).toMatchObject({ kind: "error" });
});
it("unavailable access/tampered candidate handle never calls an adapter or exposes private diagnostics", async () => {
  request = new Request(origin, { method: "POST", headers: { origin } });
  expect(await lookupTitleAction(form({ source: "youtube", query: "YtFixture01" }))).toMatchObject({ kind: "failure", manualFallback: true });
  expect(await selectCandidateAction(form({ handle: "x".repeat(43), candidateId: "1001" }))).toMatchObject({ kind: "failure" }); expect(calls).toBe(0);
});
it("review validation errors preserve the snapshot for retry and expose useful field feedback", async () => {
  const result = await lookupTitleAction(form({ source: "youtube", query: "YtFixture01" }));
  const input = form({ reviewHandle: result.handle!, title: "Synthetic action video", contentType: "youtube", minutes: "", seconds: "", numberingStyle: "none", genres: "", moods: "funny", watchUrl: "", sourceUrl: "", coverUrl: "" });
  expect(await saveTitleAction({ kind: "idle" }, input)).toMatchObject({ kind: "invalid", errors: { minutes: expect.any(String) } });
  input.set("minutes", "2"); input.set("sourceUrl", "javascript:alert(1)");
  expect(await saveTitleAction({ kind: "idle" }, input)).toMatchObject({ kind: "invalid", errors: { sourceUrl: expect.any(String) } });
  expect(db.prepare("SELECT * FROM titles").all()).toEqual([]); expect(db.prepare("SELECT count(*) n FROM metadata_reviews").get()?.n).toBe(1);
});
it("refresh action rejects unknown record ownership before provider access", async () => {
  expect(await refreshMetadataAction("not-in-this-group", { kind: "idle" }, new FormData())).toMatchObject({ kind: "error" }); expect(calls).toBe(0);
});
