// @vitest-environment node
import { expect, it, vi } from "vitest";
import { Attempts, WorkPool, checkPassword, makePassword, passwordInput, security, usernameInput } from "../../lib/accounts/security";

it("validates exact Unicode password/code-point bounds and trimmed ASCII case-folded usernames", () => {
  expect(usernameInput("  Case.Name_1  ")).toEqual({ username: "Case.Name_1", key: "case.name_1" });
  for (const name of [null, "ab", "üser", "a b", "a".repeat(33), "a\0bc"]) expect(() => usernameInput(name)).toThrow();
  for (const password of [" " + "🔒".repeat(11), "é".repeat(128), "e\u0301".repeat(6), "\0".repeat(12)]) expect(passwordInput(password)).toBe(password);
  for (const password of [null, "short", "😀".repeat(129), "a".repeat(129), "\uD800".repeat(12)]) expect(() => passwordInput(password)).toThrow();
});
it("real native default scrypt salts differ, exact values verify, malformed/unknown records do equivalent bounded work", async () => {
  const first = await makePassword(" Exact password 🔒 "), second = await makePassword(" Exact password 🔒 ");
  expect(first.salt).not.toBe(second.salt); expect(first.hash).not.toBe(second.hash);
  const row = { password_version: 1, password_algorithm: "scrypt", password_salt: first.salt, password_hash: first.hash,
    password_n: 131072, password_r: 8, password_p: 1, password_maxmem: 268435456 };
  const work = vi.spyOn(security.pool, "run");
  expect(await checkPassword(" Exact password 🔒 ", row)).toBe(true);
  expect(await checkPassword("Exact password 🔒", row)).toBe(false);
  expect(await checkPassword(" Exact password 🔒 ")).toBe(false);
  expect(await checkPassword(" Exact password 🔒 ", { ...row, password_n: Number.MAX_SAFE_INTEGER })).toBe(false);
  expect(await checkPassword(" Exact password 🔒 ", { ...row, password_hash: "bad" })).toBe(false);
  expect(work).toHaveBeenCalledTimes(5); work.mockRestore();
});
it("limits active work and waiting admission, and releases slots after success and error", async () => {
  const pool = new WorkPool(2, 8), releases: (() => void)[] = [];
  const job = () => pool.run(() => new Promise<void>(resolve => releases.push(resolve)));
  const jobs = Array.from({ length: 10 }, job); expect(pool.active).toBe(2);
  await expect(job()).rejects.toThrow(/busy/);
  for (let i = 0; i < 10; i++) { releases[i](); await new Promise(resolve => setImmediate(resolve)); }
  await Promise.all(jobs); expect(pool.active).toBe(0);
  await expect(pool.run(async () => { throw new Error("synthetic"); })).rejects.toThrow("synthetic");
  expect(await pool.run(async () => "released")).toBe("released"); expect(pool.active).toBe(0);
});
it("expires queued jobs without leaking slots", async () => {
  const pool = new WorkPool(1, 1, 5); let release!: () => void;
  const running = pool.run(() => new Promise<void>(resolve => { release = resolve; }));
  await expect(pool.run(async () => "never")).rejects.toThrow(/busy/);
  release(); await running; expect(pool.active).toBe(0); expect(await pool.run(async () => true)).toBe(true);
});
it("counts five attempts then throttles, expires windows, bounds state, and clears successful keys", () => {
  const attempts = new Attempts(5, 900000, 2);
  for (let i = 0; i < 5; i++) attempts.take("name", 100);
  expect(() => attempts.take("name", 101)).toThrow(/15 minutes/);
  attempts.take("other", 100); expect(() => attempts.take("overflow", 100)).toThrow();
  attempts.clear("name"); attempts.take("fresh", 100); attempts.take("expired", 900101);
});
