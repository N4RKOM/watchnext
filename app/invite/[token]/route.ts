import { NextResponse } from "next/server";
import { getDatabase } from "../../../db/server";
import { resolveAppOrigin } from "../../../lib/groups";
import { acceptInvitation, cookieOptions, readSessionCookie, sessionCookieName } from "../../../lib/sessions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // A relative Location stays on the browser's origin, even when Next's internal
  // request URL uses localhost instead of the address the visitor opened.
  let credential: string;
  let origin: string;
  try {
    origin = resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin;
    credential = acceptInvitation(getDatabase(), (await params).token, readSessionCookie(request.headers.get("cookie")));
  } catch {
    const response = new NextResponse(null, { status: 303, headers: { Location: "/access-error" } });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const response = new NextResponse(null, { status: 303, headers: { Location: "/group" } });
  response.cookies.set(sessionCookieName, credential, cookieOptions(new URL(request.url).protocol === "https:" ? request.url : origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
