// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { saveTitle } from "../../lib/shared-save";
import { updateEpisodeProgress } from "../../lib/episode-progress";
import { pickFromForm, readPickerPage } from "../../lib/picker/server";
let db: DatabaseSync, anna: string, max: string, viewer: string, foreign: string, movie: string, series: string;
const origin = "https://watch.example";
const req = (cookie = viewer, source = origin) => new Request(origin, { method: "POST", headers: { origin: source, cookie: `${sessionCookieName}=${cookie}` } });
const member = (cookie: string) => requireSession(db, cookie).activeMemberId!;
const snapshot = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes", "title_moods", "title_genres"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function save(title: string, type: string, duration = "24") { const result = saveTitle(db, req(anna), { kind: "manual", fields: { title, contentType: type, minutes: duration, seconds: "0", numberingStyle: type === "series" ? "continuous" : "none", genres: "", moods: ["funny"], watchUrl: "" } }, origin); if (result.kind !== "created") throw new Error(); return result.id; }
function form(extra: Record<string, string> = {}, viewers = [member(anna), member(max)]) { const form = new FormData(); Object.entries({ requestId: "request-1", groupId: requireSession(db, viewer).groupId, availableMinutes: "25", mood: "funny", ...extra }).forEach(([key, value]) => form.set(key, value)); viewers.forEach(id => form.append("viewers", id)); return form; }
const pick = (data = form(), cookie = viewer) => pickFromForm(db, req(cookie), data, origin);
const episode = (cookie: string, intent = "save_position", nextEpisode = "3") => updateEpisodeProgress(db, req(cookie), series, { intent, memberId: member(cookie), numberingStyle: "continuous", positionState: "in_progress", nextEpisode }, origin);
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); const invite = createGroup(db, "Real group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); viewer = acceptInvitation(db, invite); foreign = acceptInvitation(db, createGroup(db, "Private group", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name, color] of [[anna, "Anna", "#1d4ed8"], [max, "Max", "#0f766e"], [foreign, "Private", "#475569"]]) changeProfile(db, req(cookie), { intent: "create", name, color }, origin);
  movie = save("Real movie", "movie"); series = save("Real series", "series", "25");
});
afterEach(() => db.close());
it("loads real same-group names/colors and permits profile-free first pick without writes or shortlist", () => {
  expect(readPickerPage(db, req())).toMatchObject({ groupName: "Real group", hasActiveProfile: false, members: expect.arrayContaining([{ id: member(anna), name: "Anna", color: "#1d4ed8" }, { id: member(max), name: "Max", color: "#0f766e" }]) });
  const before = snapshot(), result = pick(); expect(result).toMatchObject({ kind: "picked", requestId: "request-1", pick: { id: movie, title: "Real movie", durationSeconds: 1440, tier: "exact", viewers: [{ name: "Anna" }, { name: "Max" }], watchUrl: null } });
  expect(result).not.toHaveProperty("candidates"); expect(JSON.stringify(result)).not.toContain("Private"); expect(snapshot()).toBe(before);
});
it("real current progress changes choose exact catch-up/restart targets and rewatching names without writes", () => {
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(movie); episode(anna); episode(max, "save_position", "7");
  expect(pick()).toMatchObject({ kind: "no_match", reasons: [expect.stringContaining("different next episodes")] });
  const before = snapshot(); expect(pick(form({ rewatches: "yes" }))).toMatchObject({ kind: "picked", pick: { id: series, target: { nextEpisode: 3, catchUp: true, restart: false }, rewatchers: [{ name: "Max", color: "#0f766e" }] } }); expect(snapshot()).toBe(before);
  episode(anna, "complete"); episode(max, "complete"); expect(pick(form({ rewatches: "yes" }))).toMatchObject({ pick: { target: { nextEpisode: 1, restart: true }, rewatchers: [{ name: "Anna" }, { name: "Max" }] } });
});
it("fresh metadata/duration/mood/archive changes preserve tier priority and exact mismatch", () => {
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(series);
  db.prepare("UPDATE titles SET duration_seconds=1501,watch_url='https://example.com/watch' WHERE id=?").run(movie);
  expect(pick()).toMatchObject({ kind: "picked", pick: { tier: "over_budget", message: "1 second longer than your available time.", watchUrl: "https://example.com/watch" } });
  db.prepare("UPDATE titles SET duration_seconds=1801 WHERE id=?").run(movie); expect(pick()).toMatchObject({ kind: "no_match" });
  db.prepare("UPDATE titles SET duration_seconds=1500 WHERE id=?").run(movie); db.prepare("UPDATE title_moods SET mood_code='dark' WHERE title_id=?").run(movie);
  expect(pick()).toMatchObject({ kind: "picked", pick: { tier: "different_mood", message: expect.stringContaining("Requested Funny; different mood: Dark") } });
  db.prepare("UPDATE titles SET watch_url='javascript:alert(1)' WHERE id=?").run(movie); expect(pick()).toMatchObject({ pick: { watchUrl: null } });
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(movie); expect(pick()).toMatchObject({ kind: "no_match", reasons: [expect.stringContaining("no active")], links: [{ href: "/group", label: "Choose profile to add a title" }] });
});
it.each(["missing", "foreign", "duplicate", "deleted", "empty"])("rejects %s viewer selection without relaxed result", mode => {
  const id = mode === "foreign" ? member(foreign) : mode === "missing" ? "missing" : member(anna);
  if (mode === "deleted") { db.prepare("UPDATE group_sessions SET active_member_id=NULL WHERE active_member_id=?").run(id); db.prepare("DELETE FROM contributors WHERE member_id=?").run(id); db.prepare("DELETE FROM members WHERE id=?").run(id); }
  const before = snapshot(), result = pick(form({}, mode === "empty" ? [] : mode === "duplicate" ? [id, id] : [id])); expect(result).toMatchObject({ kind: "invalid", errors: { viewers: expect.any(String) } }); expect(result).not.toHaveProperty("pick"); expect(snapshot()).toBe(before);
});
it.each([{ availableMinutes: "25.1" }, { availableMinutes: "1e2" }, { mood: "custom" }, { mood: "" }, { rewatches: "false" }, { durationSeconds: "1" }, { eligible: "true" }] as Record<string, string>[])("validates raw unsupported/filter claims %j", extra => expect(pick(form(extra))).toMatchObject({ kind: "invalid" }));
it("rejects repeated/file scalar fields and claims rather than coercing them", () => {
  for (const key of ["requestId", "groupId", "availableMinutes", "mood", "rewatches"]) { const data = form({ rewatches: "yes" }); data.append(key, data.get(key)!); expect(pick(data).kind).toBe("invalid"); }
  for (const key of ["viewers", "availableMinutes", "mood"]) { const data = form(); data.set(key, new Blob(["private"]), "input.txt"); expect(pick(data).kind).toBe("invalid"); }
});
it("denies session/origin/stale group and never accepts foreign private records", () => {
  const before = snapshot(); expect(() => pick(form(), foreign)).toThrow(); expect(() => pick(form({ groupId: requireSession(db, foreign).groupId }))).toThrow();
  expect(() => pickFromForm(db, req(viewer, "https://foreign.example"), form(), origin)).toThrow(); expect(() => pickFromForm(db, new Request(origin, { method: "POST" }), form(), origin)).toThrow(); expect(snapshot()).toBe(before);
});
it("expires imported metadata before snapshot, excludes it and preserves progress/feedback", () => {
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(series); db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='synthetic11' WHERE id=?").run(movie);
  for (const field of ["title", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01T00:00:00.000Z','2000-02-01T00:00:00.000Z')").run(movie, field);
  expect(pick()).toMatchObject({ kind: "no_match", reasons: [expect.stringContaining("usable title")], links: [{ href: `/watchlist/${movie}` }] }); expect(db.prepare("SELECT title,duration_seconds FROM titles WHERE id=?").get(movie)).toEqual({ title: null, duration_seconds: null }); expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
});
it("expiry storage failure rolls back and retry succeeds on a fresh snapshot", () => {
  db.prepare("INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload) VALUES ('synthetic',?,?,'synthetic','2000-01-01T00:00:00.000Z','{}')").run(requireSession(db, viewer).groupId, member(anna));
  const before = snapshot(); db.exec("CREATE TRIGGER fail_expiry BEFORE DELETE ON metadata_reviews BEGIN SELECT RAISE(ABORT,'PRIVATE SQL PATH'); END");
  expect(() => pick()).toThrow(); expect(snapshot()).toBe(before); expect(db.isTransaction).toBe(false); db.exec("DROP TRIGGER fail_expiry"); expect(pick().kind).toBe("picked");
});
