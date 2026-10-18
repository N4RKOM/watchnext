// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createIsolatedDemoRoot, demoPaths, ownerFile, testOwnerFile, validateOwnedDemo } from "../scripts/demo/paths.mjs";
import { prepareDemo, runDemoCommand } from "../scripts/demo/prepare.mjs";
import { demo, titles } from "../scripts/demo/fixture.mjs";
import { acceptInvitation, credentialHash, requireSession, sessionCookieName, validCredential } from "../lib/sessions";
import { pickFromForm } from "../lib/picker/server";
import type { PickState } from "../lib/picker/view-state";
import { resolveDatabasePath } from "../db/config";
let root: string;
const options = () => ({ testRoot: root, environment: { LOCALAPPDATA: join(root, "normal-local"), XDG_DATA_HOME: join(root, "normal-local") } });
function read(path: string, fn: (db: DatabaseSync) => unknown) { const db = new DatabaseSync(path); try { return fn(db); } finally { db.close(); } }
const snapshot = (path: string) => read(path, db => JSON.stringify(["groups", "members", "titles", "contributors", "progress", "ratings", "notes", "invitations", "demo_ownership"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())));
beforeEach(() => { root = createIsolatedDemoRoot(); });
afterEach(() => { if (resolve(dirname(root)) !== resolve(realpathSync.native(tmpdir())) || !/^watchnext-demo-test-[A-Za-z0-9]+$/.test(basename(root)) || lstatSync(root).isSymbolicLink()) throw new Error("Unsafe demo fixture cleanup"); rmSync(root, { recursive: true, force: true }); });
it("seeds deterministic manual-origin data, all types/styles/moods, joint attribution and independent history", () => {
  const prepared = prepareDemo(options()); expect(prepared.status).toBe("prepared"); expect(prepared).not.toHaveProperty("inviteUrl");
  read(prepared.path, db => {
    expect(db.prepare("SELECT id FROM titles ORDER BY created_at").all().map(row => row.id)).toEqual(titles.map(title => title.id)); expect(db.prepare("SELECT name,avatar_color FROM members ORDER BY created_at").all()).toEqual([{ name: "Anna", avatar_color: "#1d4ed8" }, { name: "Max", avatar_color: "#0f766e" }]);
    expect(db.prepare("SELECT DISTINCT content_type FROM titles ORDER BY content_type").all().map(row => row.content_type)).toEqual(["anime", "movie", "series", "youtube"]);
    expect(db.prepare("SELECT count(*) n FROM contributors WHERE title_id='demo-funny-24'").get()?.n).toBe(2);
    for (const table of ["progress", "ratings", "notes"]) expect(db.prepare(`SELECT count(*) n FROM ${table}`).get()?.n).toBe(12);
    expect(db.prepare("SELECT next_season,next_episode FROM progress WHERE title_id='demo-series' ORDER BY member_id").all()).toEqual([{ next_season: 1, next_episode: 3 }, { next_season: 1, next_episode: 7 }]);
    expect(db.prepare("SELECT next_season,next_episode FROM progress WHERE title_id='demo-anime' ORDER BY member_id").all()).toEqual([{ next_season: null, next_episode: 5 }, { next_season: null, next_episode: 2 }]);
    expect(db.prepare("SELECT timestamp_seconds,completed FROM progress WHERE title_id='demo-near' ORDER BY member_id").all()).toEqual([{ timestamp_seconds: 60, completed: 0 }, { timestamp_seconds: 1620, completed: 1 }]);
    expect(db.prepare("SELECT count(*) n FROM notes WHERE instr(body,char(10))>0").get()?.n).toBe(12);
    expect(db.prepare("SELECT count(*) n FROM titles WHERE provider_id IS NOT NULL OR source_url IS NOT NULL OR cover_url IS NOT NULL OR watch_url IS NOT NULL").get()?.n).toBe(0); expect(db.prepare("SELECT * FROM metadata_fields").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]); expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
  });
}, 30000);
it("ordinary repeat preserves demonstration edits; explicit reset restores the same IDs/counts atomically", () => {
  const first = prepareDemo(options()); read(first.path, db => db.exec("UPDATE notes SET body='A retained demonstration edit' WHERE title_id='demo-funny-24'")); const edited = snapshot(first.path);
  expect(prepareDemo(options()).status).toBe("already_prepared"); expect(snapshot(first.path)).toBe(edited);
  expect(prepareDemo({ ...options(), reset: true }).status).toBe("reset"); read(first.path, db => { expect(db.prepare("SELECT count(*) n FROM titles").get()?.n).toBe(6); expect(db.prepare("SELECT body FROM notes LIMIT 1").get()?.body).not.toBe("A retained demonstration edit"); });
}, 30000);
it("seed/reset failure rolls back baseline data and retry is safe after migration initialization", () => {
  const fail = () => { throw new Error("simulated demo failure"); };
  expect(() => prepareDemo({ ...options(), beforeCommit: fail })).toThrow("simulated demo failure"); const path = demoPaths(options()).path;
  read(path, db => { expect(db.prepare("SELECT * FROM groups").all()).toEqual([]); expect(db.prepare("SELECT baseline_ready FROM demo_ownership").get()?.baseline_ready).toBe(0); });
  prepareDemo(options()); const before = snapshot(path); expect(() => prepareDemo({ ...options(), reset: true, beforeCommit: fail })).toThrow(); expect(snapshot(path)).toBe(before);
}, 30000);
it("one-off invitation output is explicit, freshly renewed, hash-only and invalidates previous links/sessions", () => {
  const quiet = runDemoCommand([], options()); expect(/\/invite\/[A-Za-z0-9_-]{43}/.test(quiet)).toBe(false); expect(quiet.includes("$env:WATCHNEXT_DATABASE_PATH = '")).toBe(true); expect(quiet.includes("pnpm dev\nOr after pnpm build:\npnpm start")).toBe(true);
  const first = prepareDemo({ ...options(), showInvite: true }); const token = first.inviteUrl!.split("/").at(-1)!; expect(validCredential(token)).toBe(true);
  let credential = ""; read(first.path, db => { expect(db.prepare("SELECT token_hash FROM invitations").get()?.token_hash).toBe(credentialHash(token)); credential = acceptInvitation(db, token); });
  const next = prepareDemo({ ...options(), showInvite: true }); expect(next.inviteUrl !== first.inviteUrl).toBe(true);
  read(first.path, db => { expect(() => acceptInvitation(db, token)).toThrow(); expect(() => requireSession(db, credential)).toThrow(); expect(db.prepare("SELECT count(*) n FROM groups").get()?.n).toBe(1); });
  expect(readFileSync(first.path).includes(Buffer.from(token))).toBe(false); expect(readFileSync(first.path).includes(Buffer.from(credential))).toBe(false);
  const explicit = runDemoCommand(["--show-invite"], options()); expect(/PRIVATE one-off/.test(explicit)).toBe(true); expect(/\/invite\/[A-Za-z0-9_-]{43}/.test(explicit)).toBe(true);
}, 30000);
it("prints matching startup ports and refuses origins unsupported by the local demo launcher", () => {
  const output = runDemoCommand([], { ...options(), environment: { ...options().environment, WATCHNEXT_APP_ORIGIN: "http://localhost:3456" } }); expect(output.includes("pnpm dev --port 3456\nOr after pnpm build:\npnpm start --port 3456")).toBe(true);
  const before = snapshot(demoPaths(options()).path);
  for (const origin of ["https://localhost:3456", "http://[::1]:3456", "http://127.0.0.2:3456", "http://localhost:0", "https://example.com"]) expect(() => prepareDemo({ ...options(), reset: true, environment: { ...options().environment, WATCHNEXT_APP_ORIGIN: origin } })).toThrow();
  expect(snapshot(demoPaths(options()).path)).toBe(before);
}, 30000);
it("actual ranker confirms documented exact order, mismatched fallback, catch-up, anime and near-match scenarios", () => {
  const seeded = prepareDemo({ ...options(), showInvite: true }); read(seeded.path, db => {
    const credential = acceptInvitation(db, seeded.inviteUrl!.split("/").at(-1)!), request = new Request("http://127.0.0.1:3000", { method: "POST", headers: { origin: "http://127.0.0.1:3000", cookie: `${sessionCookieName}=${credential}` } });
    function pick(mood: string, minutes: string, viewers = [demo.anna, demo.max], rewatches = false, previous?: PickState) {
      const form = new FormData(); for (const [key, value] of Object.entries({ requestId: "demo-check", groupId: demo.group, mood, availableMinutes: minutes })) form.set(key, value); viewers.forEach(id => form.append("viewers", id)); if (rewatches) form.set("rewatches", "yes");
      if (mood === "funny") { form.set("pageId", "demo-order"); form.set("intentId", previous ? "next" : "first"); form.set("intent", previous ? "next" : "start"); if (previous?.kind === "picked") form.set("cursor", previous.cursor!); }
      return pickFromForm(db, request, form, "http://127.0.0.1:3000");
    }
    const first = pick("funny", "25"); expect(first).toMatchObject({ kind: "picked", pick: { id: "demo-funny-24", tier: "exact" } }); expect(pick("funny", "25", undefined, false, first)).toMatchObject({ kind: "picked", pick: { id: "demo-funny-18", tier: "exact" } });
    expect(pick("exciting", "20")).toMatchObject({ kind: "picked", pick: { id: "demo-funny-18", tier: "different_mood" } }); expect(pick("exciting", "20", undefined, true)).toMatchObject({ pick: { id: "demo-series", target: { nextSeason: 1, nextEpisode: 3 }, rewatchers: [{ id: demo.max }] } });
    expect(pick("dark", "23", undefined, true)).toMatchObject({ pick: { id: "demo-anime", target: { nextSeason: null, nextEpisode: 2 }, rewatchers: [{ id: demo.anna }] } });
    expect(pick("emotional", "25", [demo.anna])).toMatchObject({ pick: { id: "demo-near", tier: "over_budget", message: "2 minutes longer than your available time." } });
  });
}, 30000);
it("normal/configured sentinel stays unchanged, and selecting the demo as normal storage is refused before reset", () => {
  const normal = join(root, "ordinary app with spaces.sqlite"); read(normal, db => db.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('normal untouched')")); const bytes = readFileSync(normal);
  const normalDefault = resolveDatabasePath(options().environment, process.cwd(), platform(), root); mkdirSync(dirname(normalDefault), { recursive: true }); read(normalDefault, db => db.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('default untouched')")); const defaultBytes = readFileSync(normalDefault);
  const prepared = prepareDemo({ ...options(), environment: { ...options().environment, WATCHNEXT_DATABASE_PATH: normal } }); expect(readFileSync(normal).equals(bytes)).toBe(true);
  const before = readFileSync(prepared.path); expect(() => prepareDemo({ ...options(), reset: true, environment: { ...options().environment, WATCHNEXT_DATABASE_PATH: prepared.path } })).toThrow(); expect(readFileSync(prepared.path).equals(before)).toBe(true); expect(readFileSync(normal).equals(bytes)).toBe(true); expect(readFileSync(normalDefault).equals(defaultBytes)).toBe(true);
}, 30000);
it("CLI/path/environment overrides and unowned/outside test roots are refused without touching sentinels", () => {
  const sentinel = join(root, "outside.txt"); writeFileSync(sentinel, "unchanged");
  for (const args of [["--path", sentinel], ["--root", root], ["--reset", "--reset"]]) expect(() => runDemoCommand(args, options())).toThrow();
  expect(() => prepareDemo({ ...options(), path: sentinel } as Parameters<typeof prepareDemo>[0])).toThrow();
  for (const key of ["WATCHNEXT_DEMO_PATH", "WATCHNEXT_DEMO_ROOT", "WATCHNEXT_DEMO_DATABASE_PATH"]) expect(() => prepareDemo({ ...options(), environment: { ...options().environment, [key]: sentinel } })).toThrow();
  expect(() => prepareDemo({ ...options(), testRoot: join(root, "outside") })).toThrow(); expect(readFileSync(sentinel, "utf8")).toBe("unchanged"); expect(existsSync(join(root, "owned-demo"))).toBe(false);
}, 30000);
it("refuses unowned directories, unexpected files and replaced unrelated databases before modification", () => {
  const paths = demoPaths(options()); mkdirSync(paths.root); const sentinel = join(paths.root, "unrelated.txt"); writeFileSync(sentinel, "keep"); expect(() => prepareDemo(options())).toThrow(); expect(readFileSync(sentinel, "utf8")).toBe("keep");
  rmSync(sentinel); rmdirSync(paths.root); prepareDemo(options()); writeFileSync(sentinel, "keep"); const ownedBytes = readFileSync(paths.path); expect(() => prepareDemo({ ...options(), reset: true })).toThrow(); expect(readFileSync(paths.path).equals(ownedBytes)).toBe(true); expect(readFileSync(sentinel, "utf8")).toBe("keep"); rmSync(sentinel);
  const unrelated = join(root, "unrelated.sqlite"); read(unrelated, db => db.exec("CREATE TABLE sentinel(value); INSERT INTO sentinel VALUES ('unrelated')")); copyFileSync(unrelated, paths.path);
  const before = readFileSync(paths.path), other = readFileSync(unrelated); expect(() => prepareDemo({ ...options(), reset: true })).toThrow(); expect(readFileSync(paths.path).equals(before)).toBe(true); expect(readFileSync(unrelated).equals(other)).toBe(true);
}, 30000);
it("refuses a database whose ownership no longer matches its tool marker", () => {
  const prepared = prepareDemo(options()); read(prepared.path, db => db.exec("UPDATE demo_ownership SET owner_id='unrelated-owner'")); const before = readFileSync(prepared.path); expect(() => prepareDemo({ ...options(), reset: true })).toThrow(); expect(readFileSync(prepared.path).equals(before)).toBe(true);
}, 30000);
it("refuses hardlinked database/marker/journal destinations while preserving the linked sentinel", () => {
  const paths = demoPaths(options()); validateOwnedDemo(paths, true); const sentinel = join(root, "hardlink-sentinel.txt"); writeFileSync(sentinel, "unchanged"); linkSync(sentinel, paths.path); expect(() => prepareDemo({ ...options(), reset: true })).toThrow(); expect(readFileSync(sentinel, "utf8")).toBe("unchanged"); rmSync(paths.path);
  linkSync(sentinel, paths.path + "-journal"); expect(() => prepareDemo(options())).toThrow(); expect(readFileSync(sentinel, "utf8")).toBe("unchanged"); rmSync(paths.path + "-journal");
  const markerBytes = readFileSync(paths.markerPath); const linkedMarker = join(root, "linked-marker.json"); linkSync(paths.markerPath, linkedMarker); expect(() => prepareDemo(options())).toThrow(); expect(readFileSync(paths.markerPath).equals(markerBytes)).toBe(true);
}, 30000);
it("refuses linked/reparse demo directories and missing test ownership without outside writes", () => {
  const paths = demoPaths(options()), outside = join(root, "unrelated-directory"); mkdirSync(outside); writeFileSync(join(outside, "sentinel"), "unchanged"); symlinkSync(outside, paths.root, "junction");
  expect(() => prepareDemo({ ...options(), reset: true })).toThrow(); expect(readdirSync(outside)).toEqual(["sentinel"]); expect(readFileSync(join(outside, "sentinel"), "utf8")).toBe("unchanged");
  rmSync(paths.root); writeFileSync(join(root, testOwnerFile), "unowned"); expect(() => prepareDemo(options())).toThrow(); expect(existsSync(join(root, "owned-demo"))).toBe(false);
}, 30000);
it("preserves immutable migration history and refuses reset when it was tampered", () => {
  const prepared = prepareDemo(options()); read(prepared.path, db => db.exec("UPDATE schema_migrations SET checksum='tampered' WHERE version='0001'")); const before = snapshot(prepared.path); expect(() => prepareDemo({ ...options(), reset: true })).toThrow(); expect(snapshot(prepared.path)).toBe(before);
}, 30000);
