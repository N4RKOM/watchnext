// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { initializeDatabase, closeDatabase, getDatabase } from "../../db/connection";
import { expireMetadata, startMetadataMaintenance } from "../../lib/metadata/lifecycle";
const fixture = (db: DatabaseSync, expires: string) => {
  db.exec(`INSERT INTO groups(id,name) VALUES ('g','Fixture group');
    INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('m','g','Anna','anna','#1d4ed8');
    INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id) VALUES ('i','g','ERASE_IMPORTED_SYNTHETIC_VALUE','erase_imported_synthetic_value','youtube',120,'none','youtube','YtFixture01');
    INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('manual','g','Manual preserved','manual preserved','movie',240,'none');
    INSERT INTO contributors(group_id,title_id,member_id) VALUES ('g','i','m');
    INSERT INTO notes(group_id,title_id,member_id,body) VALUES ('g','i','m','Independent note');`);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('i',?,'provider','2000-01-01T00:00:00Z',?)").run(field, expires);
  db.prepare("INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload) VALUES ('synthetic','g','m','synthetic',?,?)").run(expires, JSON.stringify({ title: "ERASE_IMPORTED_SYNTHETIC_VALUE" }));
};
function isolated() { const root = mkdtempSync(join(tmpdir(), "watchnext-metadata-maintenance-")), path = join(root, "isolated.sqlite"); initializeDatabase({ WATCHNEXT_DATABASE_PATH: path }); return { root, path, cleanup() { closeDatabase(); if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-metadata-maintenance-")) throw new Error("Unsafe fixture path"); rmSync(root, { recursive: true, force: true }); } }; }
it("explicit offline command clears real values/snapshots securely without provider requests or manual/history loss", () => {
  const target = isolated();
  try {
    const db = new DatabaseSync(target.path); fixture(db, "2000-01-02T00:00:00.000Z"); db.close();
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/metadata-maintain.mjs", import.meta.url))], { env: { ...process.env, WATCHNEXT_DATABASE_PATH: target.path }, encoding: "utf8", timeout: 10000 });
    expect(run.status, run.stderr).toBe(0); expect(run.stdout).toContain("3 expired fields cleared");
    const check = new DatabaseSync(target.path);
    expect(check.prepare("SELECT title,title_key,content_type,duration_seconds FROM titles WHERE id='i'").get()).toMatchObject({ title: null, title_key: null, content_type: null, duration_seconds: null });
    expect(check.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
    expect(check.prepare("SELECT title,duration_seconds FROM titles WHERE id='manual'").get()).toMatchObject({ title: "Manual preserved", duration_seconds: 240 });
    expect(check.prepare("SELECT body FROM notes").get()?.body).toBe("Independent note"); check.close();
    expect(readFileSync(target.path).includes(Buffer.from("ERASE_IMPORTED_SYNTHETIC_VALUE"))).toBe(false);
    expect(readFileSync(target.path).includes(Buffer.from("erase_imported_synthetic_value"))).toBe(false);
  } finally { target.cleanup(); }
});
it("fresh-process-style connection open after an offline gap clears expired values before access", () => {
  const target = isolated();
  try {
    const seed = new DatabaseSync(target.path); fixture(seed, "2000-01-02T00:00:00.000Z"); seed.close();
    const db = getDatabase({ WATCHNEXT_DATABASE_PATH: target.path });
    expect(db.prepare("SELECT title FROM titles WHERE id='i'").get()?.title).toBeNull();
  } finally { target.cleanup(); }
});
it("bounded batches never mark uncleared fields as safe, and repeated maintenance finishes", () => {
  const target = isolated();
  try {
    const db = new DatabaseSync(target.path); fixture(db, "2000-01-02T00:00:00.000Z");
    expect(expireMetadata(db, new Date(), 1)).toEqual({ cleared: 1, pending: true });
    expect(expireMetadata(db)).toEqual({ cleared: 2, pending: false }); db.close();
  } finally { target.cleanup(); }
});
it("process-local deadline timer clears idle data and stops cleanly with the connection", async () => {
  const target = isolated(); let db: DatabaseSync | undefined, stop: (() => void) | undefined;
  try {
    db = new DatabaseSync(target.path); fixture(db, new Date(Date.now() + 40).toISOString()); stop = startMetadataMaintenance(db);
    await new Promise(done => setTimeout(done, 100));
    expect(db.prepare("SELECT title FROM titles WHERE id='i'").get()?.title).toBeNull();
    stop(); db.close();
  } finally { stop?.(); if (db?.isOpen) db.close(); target.cleanup(); }
});
