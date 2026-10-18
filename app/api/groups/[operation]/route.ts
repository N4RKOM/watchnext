import { NextResponse } from "next/server";
import { getDatabase } from "../../../../db/server";
import { accountBody, requireAccountPost } from "../../../../lib/accounts/http";
import { accountGroups, createAccountGroup, joinAccountGroup, pendingInviteCookieName, switchAccountGroup, useLegacyMode } from "../../../../lib/accounts/groups";
import { modeCookieName } from "../../../../lib/accounts/context";
import { cookieOptions, AccessError } from "../../../../lib/sessions";
import { AuthError } from "../../../../lib/accounts/security";
import { GroupNameError, resolveAppOrigin } from "../../../../lib/groups";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    requireAccountPost(request,process.env.WATCHNEXT_APP_ORIGIN);
    const { operation } = await context.params;
    if (!["create","join","switch","legacy"].includes(operation)) throw new AccessError();
    const input = await accountBody(request,"group-"+operation), db = getDatabase();
    let result;
    if (operation === "create") result = createAccountGroup(db,request,input.groupName,input.revision,process.env.WATCHNEXT_APP_ORIGIN);
    else if (operation === "join") result = joinAccountGroup(db,request,input.revision,process.env.WATCHNEXT_APP_ORIGIN);
    else if (operation === "switch") result = switchAccountGroup(db,request,input.groupId,input.revision,process.env.WATCHNEXT_APP_ORIGIN);
    else { useLegacyMode(db,request,input.revision,process.env.WATCHNEXT_APP_ORIGIN); result = accountGroups(db,request); }
    const response = NextResponse.json(result,{ headers: privateHeaders });
    response.cookies.set(modeCookieName,operation === "legacy" ? "legacy" : "account",cookieOptions(resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin));
    if (operation === "join") response.cookies.set(pendingInviteCookieName,"",{ ...cookieOptions(resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin),maxAge:0 });
    return response;
  } catch(error) { return NextResponse.json({ error: error instanceof GroupNameError || error instanceof AuthError ? error.message : error instanceof AccessError ? "Your account, group or invitation context changed. Reload your account and try again." : "We couldn’t update your group. Try again." },{ status:400,headers:privateHeaders }); }
}
