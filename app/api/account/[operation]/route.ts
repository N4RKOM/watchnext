import { NextResponse } from "next/server";
import { getDatabase } from "../../../../db/server";
import { accountBody, accountCookieName, accountCredential, AuthError, loginAccount, logoutAccount, recoverAccount, registerAccount, requireAccountPost } from "../../../../lib/accounts/server-only";
import { cookieOptions } from "../../../../lib/sessions";
import { resolveAppOrigin } from "../../../../lib/groups";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    requireAccountPost(request, process.env.WATCHNEXT_APP_ORIGIN);
    const { operation } = await context.params;
    if (!["register", "login", "logout", "recover"].includes(operation)) return NextResponse.json({ error: "Unavailable operation." }, { status: 404, headers: privateHeaders });
    const input = await accountBody(request, operation), previous = accountCredential(request.headers.get("cookie")), db = getDatabase();
    if (operation === "recover") {
      const result = await recoverAccount(db, input);
      const response = NextResponse.json({ ...result, location: "/login" }, { headers: privateHeaders });
      response.cookies.set(accountCookieName, "", { ...cookieOptions(resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin), maxAge: 0 });
      return response;
    }
    if (operation === "logout") {
      logoutAccount(db, previous);
      const response = NextResponse.json({ location: "/login" }, { headers: privateHeaders });
      response.cookies.set(accountCookieName, "", { ...cookieOptions(resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin), maxAge: 0 });
      return response;
    }
    const result = operation === "register" ? await registerAccount(db, input, previous) : await loginAccount(db, input, previous);
    const response = NextResponse.json({ location: "/account", ...("recoveryCode" in result && "username" in result ? { recoveryCode: result.recoveryCode, username: result.username } : {}) }, { headers: privateHeaders });
    response.cookies.set(accountCookieName, result.credential, cookieOptions(resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthError ? error.message : "We couldn’t save your sign-in. Check that local storage is ready, then try again." }, { status: 400, headers: privateHeaders });
  }
}
