// @vitest-environment node
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { initializeDatabase } from "../db/connection";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
const origin = "https://watch.example";
async function race(path: string, jobs: unknown[]) {
  const children = jobs.map(() => {
    const child = spawn(process.execPath, ["--import", new URL("./fixtures/save-resolver.mjs", import.meta.url).href, fileURLToPath(new URL("./fixtures/note-worker.mjs", import.meta.url)), new URL("../lib/notes.ts", import.meta.url).href, path], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "", errors = ""; child.stderr.on("data", data => errors += data);
    const ready = new Promise<void>((done, fail) => { let received = false; child.stdout.on("data", data => { output += data; if (output.includes("ready\n")) { received = true; done(); } }); child.once("error", fail); child.once("exit", () => { if (!received) fail(new Error("Note fixture exited before readiness")); }); });
    const finished = new Promise<void>((done, fail) => child.once("exit", code => code === 0 ? done() : fail(new Error(`Fixture process failed (${code}): ${errors}`))));
    return { child, ready, finished };
  });
  const timer = setTimeout(() => { for (const item of children) item.child.kill(); }, 10000);
  const finished = Promise.all(children.map(item => item.finished)); void finished.catch(() => {});
  try { await Promise.all(children.map(item => item.ready)); children.forEach((item, index) => item.child.stdin.end(JSON.stringify(jobs[index]))); await finished; }
  finally { clearTimeout(timer); for (const item of children) if (item.child.exitCode === null) item.child.kill(); await Promise.allSettled(children.map(item => item.finished)); }
}
it("real competing connections preserve independent rows and serialize same-member save/clear as the last committed intent", async () => {
  const root = mkdtempSync(join(tmpdir(), "watchnext-note-race-")), path = join(root, "isolated.sqlite"); initializeDatabase({ WATCHNEXT_DATABASE_PATH: path }); const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;"); const invite = createGroup(db, "Race fixture", origin).inviteUrl.split("/").at(-1)!, credentials = [acceptInvitation(db, invite), acceptInvitation(db, invite)];
    const members = credentials.map((credential, index) => { const request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${credential}` } }); changeProfile(db, request, { intent: "create", name: index ? "Max" : "Anna", color: "#1d4ed8" }, origin); return requireSession(db, credential); });
    db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('title',?,'Fixture','fixture','movie',5400,'none')").run(members[0].groupId);
    const job = (index: number, intent: string, body: string) => ({ origin, credential: credentials[index], id: "title", input: { memberId: members[index].activeMemberId!, intent, body } });
    await race(path, [job(0, "save_note", "Anna note"), job(1, "save_note", "Max note")]);
    expect(db.prepare("SELECT member_id,body FROM notes ORDER BY body").all()).toEqual([{ member_id: members[0].activeMemberId, body: "Anna note" }, { member_id: members[1].activeMemberId, body: "Max note" }]);
    db.exec(`CREATE TABLE fixture_note_log(sequence INTEGER PRIMARY KEY,member_id TEXT,body TEXT);
      CREATE TRIGGER fixture_note_insert AFTER INSERT ON notes BEGIN INSERT INTO fixture_note_log(member_id,body) VALUES (NEW.member_id,NEW.body); END;
      CREATE TRIGGER fixture_note_update AFTER UPDATE ON notes BEGIN INSERT INTO fixture_note_log(member_id,body) VALUES (NEW.member_id,NEW.body); END;
      CREATE TRIGGER fixture_note_delete AFTER DELETE ON notes BEGIN INSERT INTO fixture_note_log(member_id,body) VALUES (OLD.member_id,NULL); END;`);
    await race(path, [job(0, "save_note", "Changed 😀"), job(0, "clear_note", "")]);
    const committed = db.prepare("SELECT body FROM fixture_note_log ORDER BY sequence DESC LIMIT 1").get()!.body;
    expect(db.prepare("SELECT body FROM notes WHERE member_id=?").get(members[0].activeMemberId!)?.body ?? null).toBe(committed);
    expect(db.prepare("SELECT count(*) n FROM notes WHERE member_id=?").get(members[0].activeMemberId!)?.n).toBe(committed === null ? 0 : 1);
    expect(db.prepare("SELECT body FROM notes WHERE member_id=?").get(members[1].activeMemberId!)?.body).toBe("Max note");
    await race(path, [job(0, "save_note", "Final note")]); await race(path, [job(0, "clear_note", "")]); expect(db.prepare("SELECT body FROM notes WHERE member_id=?").get(members[0].activeMemberId!)).toBeUndefined();
  } finally { db.close(); if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-note-race-")) throw new Error("Unsafe fixture cleanup"); rmSync(root, { recursive: true, force: true }); }
}, 15000);
