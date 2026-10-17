// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { removeOwnContribution, restoreTitle } from "../lib/contributions";
import { readTitleDetails } from "../lib/title-details";
import { inspectNoteDraft } from "../lib/note-state";
import { normalizeNote, NoteFieldError, readOwnNote, updateOwnNote } from "../lib/notes";
let db: DatabaseSync, anna: string, max: string, viewer: string, other: string, movie: string, series: string, otherTitle: string;
const origin = "https://watch.example";
const req = (cookie = anna, source = origin) => new Request(origin, { method: "POST", headers: { origin: source, cookie: `${sessionCookieName}=${cookie}` } });
const input = (extra: Record<string, unknown> = {}, cookie = anna) => ({ intent: "save_note", memberId: requireSession(db, cookie).activeMemberId!, body: "Anna note", ...extra });
const write = (extra: Record<string, unknown> = {}, id = movie, cookie = anna) => updateOwnNote(db, req(cookie), id, input(extra, cookie), origin);
const all = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes", "title_moods", "title_genres", "metadata_fields"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function saved(title: string, type: string, style: string, cookie = anna) { const result = saveTitle(db, req(cookie), { kind: "manual", fields: { title, contentType: type, minutes: "90", seconds: "0", numberingStyle: style, genres: "Drama", moods: ["funny"], watchUrl: "" } }, origin); if (result.kind !== "created") throw new Error(); return result.id; }
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); viewer = acceptInvitation(db, invite); other = acceptInvitation(db, createGroup(db, "Other", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name, color] of [[anna, "Anna", "#1d4ed8"], [max, "Max", "#0f766e"], [other, "Other", "#6d28d9"]]) changeProfile(db, req(cookie), { intent: "create", name, color }, origin);
  movie = saved("Movie", "movie", "none"); series = saved("Series", "series", "season_episode"); otherTitle = saved("Other", "movie", "none", other);
});
afterEach(() => db.close());
it("normalizes CRLF/CR and outside Unicode whitespace while preserving interior spacing, combining marks and line breaks", () => {
  expect(normalizeNote("\u0085\u2003 \r\n😀  e\u0301\r\nline\rLast\u00a0\uFEFF")).toBe("😀  e\u0301\nline\nLast");
  expect(inspectNoteDraft(" \r\n😀\rX\r\n ")).toMatchObject({ normalized: "😀\nX", count: 3, error: undefined });
  expect(normalizeNote("\u0085\u00a0\r\n\uFEFF")).toBeNull();
});
it.each([undefined, null, 1, {}, ["text"], "inside\0NUL", "\0outside", "a".repeat(2001), "😀".repeat(2001)])("rejects nontext/NUL/over-limit without rewriting a prior note (%#)", body => {
  write(); const before = all(); expect(() => write({ body })).toThrow(NoteFieldError); expect(all()).toBe(before);
});
it("accepts exactly 2000 supplementary code points without UTF-16 clipping and counts combining code points individually", () => {
  const body = "😀".repeat(2000); expect(body.length).toBe(4000); expect(inspectNoteDraft(body).count).toBe(2000); expect(write({ body }).body).toBe(body);
  expect(db.prepare("SELECT length(body) n FROM notes").get()?.n).toBe(2000);
  const combining = "e\u0301".repeat(1000); expect(write({ body: combining }).body).toBe(combining); expect(inspectNoteDraft(combining).count).toBe(2000);
});
it("reads absence without inserting a row and permits whole-title notes on every type without contribution/completion", () => {
  const before = all(); expect(readOwnNote(db, req(max), movie).body).toBeNull(); expect(all()).toBe(before);
  for (const id of [movie, series, saved("Video", "youtube", "none"), saved("Anime", "anime", "continuous")]) expect(write({ body: "Whole title" }, id, max).body).toBe("Whole title");
  expect(db.prepare("SELECT * FROM progress").all()).toEqual([]); expect(readTitleDetails(db, req(), movie).contributors.map(member => member.name)).toEqual(["Anna"]);
});
it("group-visible independent notes retain attribution and do not normalize another member's legacy bytes", () => {
  const context = requireSession(db, max), legacy = "  Max\r\n  unchanged 😀  ";
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,?)").run(context.groupId, movie, context.activeMemberId!, legacy);
  const body = '<script>window.noteExecuted=true</script>\n**plain** https://example.com'; write({ body }); write({ body: "Anna edited\nnew line" });
  const detail = readTitleDetails(db, req(viewer), movie); expect(detail.activeMemberId).toBeNull(); expect(detail.history).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Anna", color: "#1d4ed8", note: "Anna edited\nnew line" }), expect.objectContaining({ name: "Max", color: "#0f766e", note: legacy })]));
  expect(readOwnNote(db, req(max), movie).body).toBe(legacy); expect(() => write({}, movie, viewer)).toThrow();
});
it("normalized-identical save is a no-op; blank/explicit/absent clear delete only own row with no phantom note", () => {
  write({ body: "One\n  two" }); write({ body: "Max preserved" }, movie, max);
  db.exec("CREATE TRIGGER forbid_note_update BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT,'No unnecessary rewrite'); END"); const prior = all(); expect(write({ body: "  One\r\n  two\r " }).body).toBe("One\n  two"); expect(all()).toBe(prior); db.exec("DROP TRIGGER forbid_note_update");
  expect(write({ body: "\u00a0\r\n  " }).body).toBeNull(); expect(readOwnNote(db, req(max), movie).body).toBe("Max preserved"); const cleared = all(); expect(write({ intent: "clear_note", body: "unsaved ignored" }).body).toBeNull(); expect(all()).toBe(cleared);
  expect(db.prepare("SELECT count(*) n FROM notes WHERE body=''").get()?.n).toBe(0);
});
it("preserves ratings, timestamps/episodes/completion, identities, contributors and provenance", () => {
  const context = requireSession(db, anna), maxId = requireSession(db, max).activeMemberId!;
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,?,?,'none',4200,1)").run(context.groupId, movie, context.activeMemberId!);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_season,next_episode) VALUES (?,?,?,'season_episode','in_progress',2,7)").run(context.groupId, series, maxId);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,8)").run(context.groupId, movie, maxId); db.prepare("INSERT INTO metadata_fields(title_id,field,origin) VALUES (?,'title','user')").run(movie);
  const preserved = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "title_moods", "title_genres", "metadata_fields"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())); const before = preserved(); write(); write({ body: "Second note" }, movie, max); write({ intent: "clear_note" }); expect(preserved()).toBe(before);
});
it("actual metadata expiry preserves notes and does not prevent own changes or reconstruct missing fields", () => {
  write(); db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='YtFixture01' WHERE id=?").run(movie);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(movie, field);
  expect(readTitleDetails(db, req(), movie)).toMatchObject({ title: null, contentType: null, durationSeconds: null }); expect(readOwnNote(db, req(), movie).body).toBe("Anna note");
  const fields = db.prepare("SELECT * FROM metadata_fields").all(); expect(write({ body: "Independent text" }).body).toBe("Independent text"); expect(db.prepare("SELECT * FROM metadata_fields").all()).toEqual(fields); expect(db.prepare("SELECT title,duration_seconds FROM titles WHERE id=?").get(movie)).toMatchObject({ title: null, duration_seconds: null });
});
it("archive/restore retains both notes and archived writes/clears are denied without implicit restoration", () => {
  write(); write({ body: "Max note" }, movie, max); const before = JSON.stringify(db.prepare("SELECT * FROM notes ORDER BY member_id").all()); removeOwnContribution(db, req(), movie, {}, origin);
  const archived = all(); for (const intent of ["save_note", "clear_note"]) expect(() => write({ intent })).toThrow(); expect(all()).toBe(archived); expect(readOwnNote(db, req(), movie).body).toBe("Anna note"); expect(readTitleDetails(db, req(viewer), movie).history.find(member => member.name === "Max")?.note).toBe("Max note");
  restoreTitle(db, req(max), movie, {}, origin); expect(JSON.stringify(db.prepare("SELECT * FROM notes ORDER BY member_id").all())).toBe(before); expect(write({ body: "After restore" }).body).toBe("After restore");
});
it("rejects forged group/member, missing member, wrong-group target and unsupported fields", () => {
  for (const [extra, id] of [[{ memberId: requireSession(db, max).activeMemberId }, movie], [{ groupId: requireSession(db, other).groupId }, movie], [{ memberId: undefined }, movie], [{}, otherTitle], [{ score: "10" }, movie], [{ completed: true }, movie]] as const) { const before = all(); expect(() => write(extra, id)).toThrow(); expect(all()).toBe(before); }
});
it("rechecks switched/missing/revoked sessions and cross/missing-origin requests without changes", () => {
  const displayed = input(); changeProfile(db, req(), { intent: "select", memberId: requireSession(db, max).activeMemberId! }, origin); let before = all(); expect(() => updateOwnNote(db, req(), movie, displayed, origin)).toThrow(); expect(all()).toBe(before);
  for (const request of [req(max, "https://evil.example"), new Request(origin, { method: "POST", headers: { cookie: `${sessionCookieName}=${max}` } }), new Request(origin, { method: "POST", headers: { origin } })]) { before = all(); expect(() => updateOwnNote(db, request, movie, input({}, max), origin)).toThrow(); expect(all()).toBe(before); }
  db.exec("UPDATE invitations SET revoked_at=CURRENT_TIMESTAMP"); before = all(); expect(() => updateOwnNote(db, req(max), movie, displayed, origin)).toThrow(); expect(all()).toBe(before);
});
it("insert/update/delete failures roll back and preserve the old note, including failed blank-clear", () => {
  for (const phase of ["INSERT", "UPDATE", "DELETE"]) {
    if (phase !== "INSERT") write(); const before = all(); db.exec(`CREATE TRIGGER fail_note BEFORE ${phase} ON notes BEGIN SELECT RAISE(ABORT,'synthetic private failure'); END`);
    expect(() => write(phase === "DELETE" ? { intent: "clear_note" } : { body: "Changed" })).toThrow(); if (phase === "DELETE") expect(() => write({ body: " " })).toThrow(); expect(all()).toBe(before); db.exec("DROP TRIGGER fail_note");
  }
  expect(write({ body: "Retry text" }).body).toBe("Retry text");
});
