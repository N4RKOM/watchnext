// @vitest-environment node
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { pickFromForm } from "../../lib/picker/server";
import type { PickState } from "../../lib/picker/view-state";
let db: DatabaseSync, cookie: string, secondCookie: string, group: string, anna: string, max: string, other: string, pageId: string;
const origin = "https://watch.example";
const req = (credential = cookie) => new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${credential}` } });
const history = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function data(previous?: PickState, overrides: Record<string, string> = {}, viewers = [anna, max]) {
  const form = new FormData(); Object.entries({ requestId: randomUUID(), groupId: group, availableMinutes: "25", mood: "funny", pageId,
    intentId: randomUUID(), intent: previous && (previous.kind === "picked" || previous.kind === "exhausted") ? "next" : "start", ...overrides }).forEach(([key, value]) => form.set(key, value));
  if (previous && (previous.kind === "picked" || previous.kind === "exhausted") && previous.cursor) form.set("cursor", previous.cursor);
  viewers.forEach(id => form.append("viewers", id)); return form;
}
const pick = (form = data(), credential = cookie) => pickFromForm(db, req(credential), form, origin);
const next = (previous: PickState, overrides: Record<string, string> = {}, viewers = [anna, max]) => pick(data(previous, overrides, viewers));
function saved(id: string, duration: number, mood = "funny") {
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES (?,?,?,?,'movie',?,'none')").run(id, group, `Saved ${id}`, id.toLowerCase(), duration);
  db.prepare("INSERT INTO title_moods(title_id,mood_code) VALUES (?,?)").run(id, mood); db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(group, id, anna);
}
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); const invite = createGroup(db, "Cycle group", origin).inviteUrl.split("/").at(-1)!;
  cookie = acceptInvitation(db, invite); secondCookie = acceptInvitation(db, invite); group = requireSession(db, cookie).groupId; pageId = randomUUID();
  for (const [index, name] of ["Anna", "Max", "Other"].entries()) { const credential = acceptInvitation(db, invite); changeProfile(db, req(credential), { intent: "create", name, color: "#1d4ed8" }, origin); const id = requireSession(db, credential).activeMemberId!; if (index === 0) anna = id; else if (index === 1) max = id; else other = id; }
  saved("A", 1500); saved("B", 1440); saved("C", 1080);
});
afterEach(() => db.close());
it.each(["exact", "over_budget", "different_mood"])("real %s tier returns A/B/C, exhausts alone and explicitly restarts without history writes", tier => {
  if (tier === "over_budget") { for (const [id, duration] of [["A", 1501], ["B", 1560], ["C", 1800]]) db.prepare("UPDATE titles SET duration_seconds=? WHERE id=?").run(duration, id); saved("lower-tier", 1500, "dark"); }
  else if (tier === "different_mood") db.exec("UPDATE title_moods SET mood_code='dark'");
  else { saved("over-fallback", 1501); saved("different-fallback", 1500, "dark"); }
  const before = history(); let result = pick();
  for (const id of ["A", "B", "C"]) { expect(result).toMatchObject({ kind: "picked", refreshed: false, pick: { id, tier } }); result = next(result); }
  expect(result.kind).toBe("exhausted"); const restart = next(result, { intent: "restart" }); expect(restart).toMatchObject({ kind: "picked", pick: { id: "A", tier } }); expect(history()).toBe(before);
});
it("one candidate exhausts, zero returns no_match and no cursor", () => {
  db.exec("UPDATE titles SET archived=1 WHERE id IN ('B','C')"); const result = pick(); expect(next(result)).toMatchObject({ kind: "exhausted" });
  pageId = randomUUID(); db.exec("UPDATE titles SET archived=1"); expect(pick()).toMatchObject({ kind: "no_match" }); expect(pick()).not.toHaveProperty("cursor");
});
it("same-intent retry is idempotent and older replay/tamper/foreign-session state cannot skip positions", () => {
  const first = pick(), form = data(first), second = pick(form); expect(second).toMatchObject({ kind: "picked", pick: { id: "B" } });
  expect(pick(form)).toMatchObject({ kind: "picked", cursor: second.kind === "picked" ? second.cursor : "", pick: { id: "B" } });
  expect(pick(data(first))).toMatchObject({ kind: "conflict" }); const tampered = data(second); tampered.set("cursor", "a".repeat(43)); expect(pick(tampered)).toMatchObject({ kind: "conflict" });
  expect(pick(data(second), secondCookie)).toMatchObject({ kind: "conflict" }); expect(next(second)).toMatchObject({ kind: "picked", pick: { id: "C" } });
});
it("canonical viewer reordering continues the same cycle; changed filter context conflicts safely", () => {
  const first = pick(); expect(next(first, {}, [max, anna])).toMatchObject({ kind: "picked", refreshed: false, pick: { id: "B" } });
  const changes: Record<string, string>[] = [{ availableMinutes: "24" }, { mood: "dark" }, { rewatches: "yes" }];
  for (const extra of changes) expect(next(first, extra)).toMatchObject({ kind: "conflict" });
});
it("two pages sharing a session remain independent and own-profile switching does not substitute picker viewers", () => {
  const firstPage = pageId, first = pick(); pageId = randomUUID(); const second = pick(); expect(next(second)).toMatchObject({ pick: { id: "B" } });
  pageId = firstPage; changeProfile(db, req(), { intent: "select", memberId: other }, origin);
  expect(next(first)).toMatchObject({ kind: "picked", refreshed: false, pick: { id: "B", viewers: [{ id: anna }, { id: max }] } });
});
const mutations: { name: string; setup?: () => void; mutate: () => void; first?: string }[] = [
  { name: "archive", mutate: () => { db.exec("UPDATE titles SET archived=1 WHERE id='A'"); }, first: "B" },
  { name: "restore", setup: () => { db.exec("UPDATE titles SET archived=1 WHERE id='C'"); }, mutate: () => { db.exec("UPDATE titles SET archived=0 WHERE id='C'"); } },
  { name: "addition", mutate: () => saved("new", 60) },
  { name: "removal", mutate: () => { db.exec("DELETE FROM contributors WHERE title_id='C'; DELETE FROM title_moods WHERE title_id='C'; DELETE FROM titles WHERE id='C'"); } },
  { name: "contribution addition", mutate: () => { db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,'C',?)").run(group, max); } },
  { name: "contribution removal", mutate: () => { db.exec("DELETE FROM contributors WHERE title_id='C'"); } },
  { name: "duration", mutate: () => { db.exec("UPDATE titles SET duration_seconds=1400 WHERE id='C'"); } },
  { name: "mood", mutate: () => { db.exec("UPDATE title_moods SET mood_code='dark' WHERE title_id='C'"); } },
  { name: "display identity", mutate: () => { db.exec("UPDATE titles SET title='Updated title',title_key='updated title' WHERE id='C'"); } },
  { name: "type", mutate: () => { db.exec("UPDATE titles SET content_type='youtube' WHERE id='C'"); } },
  { name: "provider identity", mutate: () => { db.exec("UPDATE titles SET provider_namespace='youtube',provider_id='synthetic11' WHERE id='C'"); } },
  ...["watch_url", "source_url", "cover_url"].map(column => ({ name: column, mutate: () => { db.prepare(`UPDATE titles SET ${column}='https://example.com/changed' WHERE id='C'`).run(); } })),
  { name: "selected completion", mutate: () => { db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,completed) VALUES (?,'C',?,'none',1)").run(group, anna); } },
  { name: "selected timestamp", mutate: () => { db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES (?,'C',?,'none',0)").run(group, anna); } },
  { name: "metadata expiry", setup: () => { db.exec("UPDATE titles SET provider_namespace='youtube',provider_id='synthetic11' WHERE id='A'"); }, mutate: () => { db.exec("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('A','title','provider','2000-01-01T00:00:00.000Z','2000-02-01T00:00:00.000Z')"); }, first: "B" },
];
it.each(mutations)("semantic $name invalidation returns a disclosed freshly validated first candidate", test => {
  test.setup?.(); const first = pick(); test.mutate(); const result = next(first); expect(result).toMatchObject({ kind: "picked", refreshed: true, pick: { id: test.first ?? "A" } });
});
it("ratings, notes, nonselected progress and unchanged-value refresh bookkeeping do not reset", () => {
  db.exec("UPDATE titles SET provider_namespace='youtube',provider_id='synthetic11' WHERE id='A'"); const first = pick();
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,'A',?,1)").run(group, anna); db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,'B',?,'No ranking influence')").run(group, max);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,completed) VALUES (?,'A',?,'none',1)").run(group, other);
  db.exec("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('A','title','provider','2026-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z')");
  expect(next(first)).toMatchObject({ kind: "picked", refreshed: false, pick: { id: "B" } });
});
it("storage failure consumes no position and retry revalidates the same logical next candidate", () => {
  const first = pick(), form = data(first); db.prepare("INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload) VALUES ('cycle-failure',?,?,'synthetic','2000-01-01T00:00:00.000Z','{}')").run(group, anna);
  db.exec("CREATE TRIGGER fail_cycle BEFORE DELETE ON metadata_reviews BEGIN SELECT RAISE(ABORT,'PRIVATE SQL'); END"); expect(() => pick(form)).toThrow(); db.exec("DROP TRIGGER fail_cycle"); expect(pick(form)).toMatchObject({ kind: "picked", refreshed: false, pick: { id: "B" } });
});
it("invalidated-to-empty cycle returns real no_match rather than stale title or exhaustion", () => {
  const first = pick(); db.exec("UPDATE titles SET archived=1"); expect(next(first)).toMatchObject({ kind: "no_match", refreshed: true });
});
it("episode updates change target identity and disclose reset without suggesting successive episodes automatically", () => {
  db.exec("UPDATE titles SET archived=1"); db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('series',?,'Series','series','series',1500,'continuous')").run(group);
  db.exec("INSERT INTO title_moods(title_id,mood_code) VALUES ('series','funny')"); for (const member of [anna, max]) db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_episode) VALUES (?,'series',?,'continuous','in_progress',3)").run(group, member);
  const first = pick(); expect(first).toMatchObject({ pick: { target: { nextEpisode: 3 } } }); expect(next(first)).toMatchObject({ kind: "exhausted" });
  pageId = randomUUID(); const fresh = pick(); db.exec("UPDATE progress SET next_episode=4 WHERE title_id='series'"); expect(next(fresh)).toMatchObject({ kind: "picked", refreshed: true, pick: { target: { nextEpisode: 4 } } });
});
