// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../../db/migrate";
import { accountBody, requireAccountPost } from "../../lib/accounts/http";
import { accountCookieName, accountCredential, currentAccount } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
const mocks = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock("../../db/server", () => ({ getDatabase: mocks.database }));
vi.mock("../../lib/accounts/server-only", async () => ({ ...await import("../../lib/accounts/service"), ...await import("../../lib/accounts/security"), ...await import("../../lib/accounts/http") }));
import { POST } from "../../app/api/account/[operation]/route";
let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(":memory:"); migrate(db); mocks.database.mockReturnValue(db); security.signupTotal.clear("all"); });
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
const password = "Synthetic private password";
const origin = "http://127.0.0.1:3000";
const request = (body: unknown, headers = {}, method = "POST") => new Request(origin + "/api/account/register", { method, headers: { origin, "content-type": "application/json", ...headers }, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) });
const call = (operation: string, req: Request) => POST(req, { params: Promise.resolve({ operation }) });
it("rejects missing/cross-site/wrong origin and GET before database access; ignores forwarded authority", async () => {
  for (const req of [request({}, { origin: "" }), request({}, { origin: "https://other.example" }), request({}, { "sec-fetch-site": "cross-site" }), request({}, {}, "GET"), request({}, { origin: "https://forged.example", "x-forwarded-host": "127.0.0.1:3000" })]) {
    expect(() => requireAccountPost(req)).toThrow(); expect((await call("register", req)).status).toBe(400);
  }
  expect(mocks.database).not.toHaveBeenCalled();
});
it("bounds and validates body, fields and content type including non-text values/return redirects", async () => {
  for (const body of [null, [], { returnTo: "https://evil.example" }, { password: "a".repeat(5000) }]) await expect(accountBody(request(body), "register")).rejects.toThrow();
  await expect(accountBody(request({}, { "content-type": "text/plain" }), "register")).rejects.toThrow();
  for (const body of [{}, { username: {}, password }, { username: "Body.User", password: {}, confirmation: {} }]) {
    const response = await call("register", request(body)); expect(response.status).toBe(400); expect(await response.text()).not.toContain(password);
  }
});
it("cancels a stalled body after ten seconds even if its first chunk looked like valid JSON", async () => {
  vi.useFakeTimers();
  try {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{}")); } });
    const req = new Request(origin, { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    const rejected = expect(accountBody(req, "logout")).rejects.toThrow(/too long/);
    await vi.advanceTimersByTimeAsync(10001); await rejected;
  } finally { vi.useRealTimers(); }
});
it("returns a private once-only recovery view with secure browser-session cookie and safe login/logout", async () => {
  vi.stubEnv("WATCHNEXT_APP_ORIGIN", "https://watch.example");
  const req = (body: unknown, cookie?: string) => request(body, { origin: "https://watch.example", ...(cookie ? { cookie } : {}) });
  const registered = await call("register", req({ username: "Http.User", password, confirmation: password }));
  expect(registered.status).toBe(200); expect(registered.headers.get("cache-control")).toBe("private, no-store");
  const payload = await registered.json(), header = registered.headers.get("set-cookie")!;
  expect(header).toContain("HttpOnly"); expect(header).toContain("Secure"); expect(header).toContain("SameSite=lax"); expect(header).toContain("Path=/");
  expect(header).not.toMatch(/Expires=|Max-Age=/i); expect(payload.recoveryCode).toHaveLength(43);
  const cookie = header.split(";")[0], old = accountCredential(cookie);
  const login = await call("login", req({ username: "HTTP.USER", password }, cookie));
  expect(await login.json()).toEqual({ location: "/account" }); expect(currentAccount(db, old)).toBeNull();
  const nextCookie = login.headers.get("set-cookie")!.split(";")[0], credential = accountCredential(nextCookie);
  const logout = await call("logout", req({}, nextCookie));
  expect(logout.headers.get("set-cookie")).toContain(`${accountCookieName}=`); expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(logout.headers.get("set-cookie")).not.toContain("watchnext_session="); expect(currentAccount(db, credential)).toBeNull();
});
it("returns safe retryable storage failures without leaking password, SQL, path or issuing a session", async () => {
  mocks.database.mockImplementation(() => { throw new Error("SQL private database path"); });
  const response = await call("login", request({ username: "Http.User", password }));
  expect(response.status).toBe(400); const text = await response.text(); expect(text).toContain("try again");
  expect(text).not.toMatch(/SQL|private database path|Synthetic private password/); expect(response.headers.get("set-cookie")).toBeNull();
});
it("recovery needs current code proof regardless of duplicate/other-account cookies, clears only browser account cookie and returns a private replacement", async () => {
  security.recoveryTotal.clear("all");
  const register = async (username: string) => {
    const response = await call("register", request({ username, password, confirmation: password }));
    return { cookie: response.headers.get("set-cookie")!.split(";")[0], body: await response.json() };
  };
  const a = await register("Recovery.HttpA"), b = await register("Recovery.HttpB");
  const duplicate = a.cookie + "; " + a.cookie;
  const input = { username: "Recovery.HttpB", recoveryCode: b.body.recoveryCode, password: password + " new", confirmation: password + " new" };
  const errors = [];
  for (const fields of [{ ...input, recoveryCode: "wrong" }, { ...input, username: "Unknown.Http" }, { ...input, recoveryCode: undefined }]) {
    const response = await call("recover", request(fields, { cookie: duplicate }));
    expect(response.status).toBe(400); errors.push(await response.json()); expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(errors[0]).toEqual(errors[1]); expect(errors[1]).toEqual(errors[2]);
  const response = await call("recover", request(input, { cookie: duplicate }));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const result = await response.json(); expect(result.location).toBe("/login"); expect(result.recoveryCode).toHaveLength(43); expect(result.recoveryCode).not.toBe(b.body.recoveryCode);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0"); expect(response.headers.get("set-cookie")).not.toContain("watchnext_session=");
  expect(currentAccount(db, accountCredential(b.cookie))).toBeNull(); expect(currentAccount(db, accountCredential(a.cookie))).not.toBeNull();
  const reused = await call("recover", request(input)); expect(reused.status).toBe(400); expect(await reused.json()).toEqual(errors[0]);
});
it("recovery rejects IDs, unsafe origins/methods/shape/size and invalid new passwords without changing credentials", async () => {
  security.recoveryTotal.clear("all");
  const registration = await call("register", request({ username: "Recovery.Guards", password, confirmation: password }));
  const original = await registration.json();
  const input = { username: "Recovery.Guards", recoveryCode: original.recoveryCode, password: password + " replacement", confirmation: password + " replacement" };
  const snapshot = () => JSON.stringify([db.prepare("SELECT * FROM accounts").all(), db.prepare("SELECT * FROM account_sessions").all()]);
  const before = snapshot();
  for (const req of [request(input, { origin: "" }), request(input, { origin: "https://other.example" }), request(input, {}, "GET"), request({ ...input, accountId: "other" }), request({ ...input, memberId: "old" }), request({ ...input, recoveryCode: "x".repeat(5000) }), request([]), request({ ...input, password: "short", confirmation: "short" }), request({ ...input, confirmation: "different" })])
    expect((await call("recover", req)).status).toBe(400);
  expect(snapshot()).toBe(before);
});
