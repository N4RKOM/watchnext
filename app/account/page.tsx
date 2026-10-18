import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../../db/server";
import { accountCredential, currentAccount } from "../../lib/accounts/server-only";
import { AccountForm } from "../components/account-form";
import { accountGroups, pendingAccountInvite } from "../../lib/accounts/groups";
import { resolveAppOrigin } from "../../lib/groups";
import { AccountGroupPanel } from "./group-panel";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  let account;
  try { account = currentAccount(getDatabase(), accountCredential((await headers()).get("cookie"))); }
  catch { return <div className="page-content"><h1>Account unavailable</h1><p role="alert">We couldn’t open local storage. Try reloading this page.</p><Link href="/account">Try again</Link></div>; }
  if (!account) redirect("/login");
  try {
    const request = new Request(resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin,{headers:await headers()}), db = getDatabase();
    return <div className="page-content"><div className="page-heading"><h1>Your account</h1><p>Signed in as <strong>{account.username}</strong></p></div>
      <AccountGroupPanel initial={accountGroups(db,request)} pendingInvite={pendingAccountInvite(db,request)} /><AccountForm operation="logout" /></div>;
  } catch { return <div className="page-content"><h1>Groups unavailable</h1><p role="alert">We couldn’t open your groups. Try again.</p><Link href="/account">Reload account</Link></div>; }
}
