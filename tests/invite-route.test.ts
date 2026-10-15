// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { getDatabase } from "../db/server";
import { createGroup } from "../lib/groups";
import { requireSession, sessionCookieName } from "../lib/sessions";
import { GET } from "../app/invite/[token]/route";
import { GET as missingInvite } from "../app/invite/route";

vi.mock("../db/server", () => ({ getDatabase: vi.fn() }));
let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(":memory:"); migrate(db); vi.mocked(getDatabase).mockReturnValue(db); vi.stubEnv("WATCHNEXT_APP_ORIGIN", "https://watch.example"); });
afterEach(() => { db.close(); vi.unstubAllEnvs(); });

it("redirects to a token-free destination with protected browser-session cookie and referrer/cache policy", async () => {
  const token = createGroup(db, "Route group", "https://watch.example").inviteUrl.split("/").at(-1)!;
  const result = await GET(new Request(`https://watch.example/invite/${token}`), { params: Promise.resolve({ token }) });
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe("/group");
  expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  expect(result.headers.get("cache-control")).toBe("no-store");
  const cookie = result.cookies.get(sessionCookieName)!;
  const attributes = result.headers.get("set-cookie")!.split(";").slice(1).map((value) => value.trim().toLowerCase());
  expect(attributes).toEqual(expect.arrayContaining(["path=/", "httponly", "secure", "samesite=lax"]));
  expect(attributes.some((value) => value.startsWith("max-age=") || value.startsWith("expires="))).toBe(false);
  expect(requireSession(db, cookie.value).groupName).toBe("Route group");
});

it("malformed and missing invitations reveal no group or cookie replacement", async () => {
  const result = await GET(new Request("https://watch.example/invite/not-a-token"), { params: Promise.resolve({ token: "not-a-token" }) });
  expect(result.headers.get("location")).toBe("/access-error");
  expect(result.headers.get("set-cookie")).toBeNull();
  expect((await result.text()).includes("Route group")).toBe(false);
  expect(missingInvite().headers.get("location")).toBe("/access-error");
});
