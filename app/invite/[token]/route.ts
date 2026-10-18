import { NextResponse } from "next/server";
import { getDatabase } from "../../../db/server";
import { resolveAppOrigin } from "../../../lib/groups";
import { acceptInvitation, cookieOptions, readSessionCookie, sessionCookieName } from "../../../lib/sessions";
import { credentialHash, validCredential } from "../../../lib/sessions";
import { beginAccountInvite, pendingInviteCookieName } from "../../../lib/accounts/groups";
import { accountSession, modeCookieName } from "../../../lib/accounts/context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // A relative Location stays on the browser's origin, even when Next's internal
  // request URL uses localhost instead of the address the visitor opened.
  let credential: string;
  let origin: string;
  try {
    origin = resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin;
    const db = getDatabase(), token = (await params).token;
    const invitation = validCredential(token) ? db.prepare("SELECT g.access_mode FROM invitations i JOIN groups g ON g.id=i.group_id WHERE i.token_hash=?").get(credentialHash(token)) : null;
    if (invitation?.access_mode === "account") {
      const intent = beginAccountInvite(db,token); let location = "/login";
      try { accountSession(db,request); location = "/account"; } catch { /* No private group name before authentication. */ }
      const response = new NextResponse(null,{ status:303,headers:{ Location:location,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer" } });
      response.cookies.set(pendingInviteCookieName,intent,{ ...cookieOptions(origin),maxAge:600 });
      return response;
    }
    credential = acceptInvitation(db, token, readSessionCookie(request.headers.get("cookie")));
  } catch {
    const response = new NextResponse(null, { status: 303, headers: { Location: "/access-error" } });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const response = new NextResponse(null, { status: 303, headers: { Location: "/group" } });
  response.cookies.set(sessionCookieName, credential, cookieOptions(new URL(request.url).protocol === "https:" ? request.url : origin));
  response.cookies.set(modeCookieName,"legacy",cookieOptions(origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
