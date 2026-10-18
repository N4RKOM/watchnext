import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const passwordParameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
export class AuthError extends Error {
  constructor(message = "We couldn’t complete that request. Try again.") { super(message); }
}
export class WorkPool {
  active = 0;
  private waiting: { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(private limit = 2, private capacity = 8, private waitMs = 30_000) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) this.active++;
    else {
      if (this.waiting.length >= this.capacity) throw new AuthError("Sign-in is busy. Wait a moment and try again.");
      await new Promise<void>((resolve, reject) => {
        const entry = { resolve, reject, timer: setTimeout(() => {
          this.waiting = this.waiting.filter(item => item !== entry);
          reject(new AuthError("Sign-in is busy. Wait a moment and try again."));
        }, this.waitMs) };
        this.waiting.push(entry);
      });
    }
    try { return await work(); }
    finally {
      this.active--;
      const next = this.waiting.shift();
      if (next) { clearTimeout(next.timer); this.active++; next.resolve(); }
    }
  }
}
export class Attempts {
  private entries = new Map<string, { count: number; expires: number }>();
  constructor(private maximum = 5, private windowMs = 15 * 60_000, private capacity = 2048) {}
  take(key: string, now = Date.now()) {
    for (const [name, entry] of this.entries) if (entry.expires <= now) this.entries.delete(name);
    const entry = this.entries.get(key);
    if ((!entry && this.entries.size >= this.capacity) || (entry && entry.count >= this.maximum))
      throw new AuthError("Too many attempts. Wait 15 minutes and try again.");
    this.entries.set(key, { count: (entry?.count ?? 0) + 1, expires: entry?.expires ?? now + this.windowMs });
  }
  clear(key: string) { this.entries.delete(key); }
}
type SecurityState = { pool: WorkPool; login: Attempts; signup: Attempts; signupTotal: Attempts };
const shared = globalThis as typeof globalThis & { __watchnextAccountSecurity?: SecurityState };
export const security = shared.__watchnextAccountSecurity ??= { pool: new WorkPool(), login: new Attempts(), signup: new Attempts(), signupTotal: new Attempts(30, 15 * 60_000, 1) };

export function usernameInput(value: unknown) {
  if (typeof value !== "string" || value.length > 128) throw new AuthError("Use a username of 3–32 letters, numbers, underscores, dots or hyphens.");
  const username = value.trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw new AuthError("Use a username of 3–32 letters, numbers, underscores, dots or hyphens.");
  return { username, key: username.toLowerCase() };
}
export function passwordInput(value: unknown): string {
  if (typeof value !== "string" || value.length > 256 || [...value].length < 12 || [...value].length > 128 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
    throw new AuthError("Use a password of 12–128 characters. Spaces count and are kept exactly.");
  return value;
}
export function derive(password: string, salt: string) {
  return security.pool.run(() => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 64, passwordParameters, (error, key) => error ? reject(error) : resolve(key));
  }));
}
export async function makePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: (await derive(password, salt)).toString("hex") };
}
export async function checkPassword(password: string, row?: Record<string, unknown>) {
  const supported = row && row.password_version === 1 && row.password_algorithm === "scrypt" &&
    row.password_n === passwordParameters.N && row.password_r === passwordParameters.r && row.password_p === passwordParameters.p &&
    row.password_maxmem === passwordParameters.maxmem && typeof row.password_salt === "string" && /^[0-9a-f]{32}$/.test(row.password_salt) &&
    typeof row.password_hash === "string" && /^[0-9a-f]{128}$/.test(row.password_hash);
  // Unknown/malformed rows do the same bounded real work. No untrusted parameters reach crypto.
  const actual = await derive(password, supported ? row.password_salt as string : "00".repeat(16));
  const expected = Buffer.from(supported ? row.password_hash as string : "00".repeat(64), "hex");
  return timingSafeEqual(actual, expected) && Boolean(supported);
}
