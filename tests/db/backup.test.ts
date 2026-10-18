// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { initializeDatabase } from "../../db/connection";
import { createSnapshot } from "../../scripts/db/snapshot.mjs";
import { verifyBackup } from "../fixtures/backup-check.mjs";
let root: string, source: string;
beforeEach(() => { root = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-backup-test-")); source = join(root, "source's file with spaces.sqlite"); initializeDatabase({ WATCHNEXT_DATABASE_PATH: source }); });
afterEach(() => { if (dirname(resolve(root)) !== realpathSync.native(tmpdir()) || !/^watchnext-backup-test-[A-Za-z0-9]+$/.test(basename(root))) throw new Error("Unsafe backup test cleanup"); rmSync(root, { recursive: true, force: true }); });
it("executes the WAL-aware documented snapshot/restore/expiry recipe with all member history and unchanged source", () => { expect(Object.values(verifyBackup()).every(Boolean)).toBe(true); }, 30000);
it("binds quoted filenames and requires a new destination without overwriting source, empty or unrelated files", () => {
  const destination = join(root, "new backup's file.sqlite"), original = readFileSync(source); createSnapshot(source, destination); expect(existsSync(destination)).toBe(true); expect(readFileSync(source).equals(original)).toBe(true);
  const sentinel = join(root, "unrelated.sqlite"); writeFileSync(sentinel, "private sentinel"); const empty = join(root, "existing empty.sqlite"); writeFileSync(empty, "");
  for (const target of [source, destination, sentinel, empty]) expect(() => createSnapshot(source, target)).toThrow(); expect(readFileSync(sentinel, "utf8")).toBe("private sentinel"); expect(readFileSync(empty).length).toBe(0); expect(readFileSync(source).equals(original)).toBe(true);
});
it("refuses linked/URI/relative destinations and preserves linked source/sentinel values", () => {
  const linked = join(root, "linked.sqlite"); linkSync(source, linked); const original = readFileSync(source); expect(() => createSnapshot(source, join(root, "refused.sqlite"))).toThrow(); expect(readFileSync(source).equals(original)).toBe(true); rmSync(linked);
  const alias = join(root, "alias"); symlinkSync(root, alias, "junction"); for (const target of [join(alias, "redirected.sqlite"), "relative.sqlite", "file:fake.sqlite"]) expect(() => createSnapshot(source, target)).toThrow(); expect(existsSync(join(root, "redirected.sqlite"))).toBe(false); rmSync(alias);
});
it("removes only its own failed output reservation and rejects invalid schema before creating output", () => {
  const target = join(root, "failed.sqlite"), original = readFileSync(source); expect(() => createSnapshot(source, target, { beforeSnapshot() { throw new Error("simulated snapshot failure"); } })).toThrow(); expect(existsSync(target)).toBe(false); expect(readFileSync(source).equals(original)).toBe(true);
  const db = new DatabaseSync(source); db.exec("UPDATE schema_migrations SET checksum='mismatch'"); db.close(); expect(() => createSnapshot(source, target)).toThrow(); expect(existsSync(target)).toBe(false);
});
