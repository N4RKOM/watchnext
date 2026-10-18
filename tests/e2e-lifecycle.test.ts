// @vitest-environment node
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { assertOwnedRoot, createFixture, safeDiagnostic } from "./e2e/lifecycle.mjs";
it("refuses unrelated cleanup roots and redirected owned-prefix roots without touching their sentinel", () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-e2e-unit-")), link = join(realpathSync.native(tmpdir()), `watchnext-e2e-${randomBytes(8).toString("hex")}`);
  try {
    writeFileSync(join(root, "sentinel"), "unrelated data"); expect(() => assertOwnedRoot(root)).toThrow(); expect(() => assertOwnedRoot(process.cwd())).toThrow();
    symlinkSync(root, link, "junction"); expect(() => assertOwnedRoot(link)).toThrow(); expect(readFileSync(join(root, "sentinel"), "utf8")).toBe("unrelated data");
  } finally {
    if (existsSync(link)) rmSync(link);
    if (resolve(dirname(root)) !== realpathSync.native(tmpdir()) || !basename(root).startsWith("watchnext-e2e-unit-")) throw new Error("Unsafe unit fixture cleanup"); rmSync(root, { recursive: true, force: true });
  }
});
it("keeps failure context while redacting synthetic credentials, invite URLs and fixture paths", () => {
  const secret = randomBytes(32).toString("base64url"), root = join(realpathSync.native(tmpdir()), "watchnext-e2e-example"); const error = new Error(`Expected button; observed invite http://127.0.0.1/invite/${secret} at ${root}`);
  const output = safeDiagnostic(error, [secret], root); expect(output.includes(secret)).toBe(false); expect(output.includes(root)).toBe(false); expect(output.includes("Expected button")).toBe(true); expect(output.includes("<redacted>")).toBe(true);
});
it("cleans a partially initialized fixture before build/server setup and allows a fresh independent fixture", async () => {
  const first = await createFixture(); const firstRoot = first.root; await first.cleanup(); expect(existsSync(firstRoot)).toBe(false); expect(first.cleanupComplete).toBe(true); await first.cleanup();
  const next = await createFixture(); try { expect(next.root !== firstRoot).toBe(true); expect(existsSync(join(next.sentinelRoot, "normal-user.sqlite"))).toBe(true); expect(next.sentinelRoot.startsWith(next.root)).toBe(false); } finally { await next.cleanup(); } expect(existsSync(next.root)).toBe(false); expect(existsSync(next.sentinelRoot)).toBe(false);
});
it("does not expose raw SQLite failures or neighbouring sentinel paths", () => {
  const root = join(realpathSync.native(tmpdir()), "watchnext-e2e-example"), sentinel = join(realpathSync.native(tmpdir()), "watchnext-e2e-sentinels-example");
  const sql = safeDiagnostic(Object.assign(new Error("Sensitive statement at private database location"), { code: "ERR_SQLITE_ERROR" }), [], root, [sentinel]); expect(sql.includes("Sensitive statement")).toBe(false); expect(sql.includes("DatabaseError")).toBe(true);
  const filesystem = safeDiagnostic(new Error(`Expected sentinel, observed missing at ${sentinel}`), [], root, [sentinel]); expect(filesystem.includes(sentinel)).toBe(false); expect(filesystem.includes("<fixture>")).toBe(true);
});
