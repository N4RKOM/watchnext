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
