import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../../db/server";
import { accountCredential, currentAccount } from "../../lib/accounts/server-only";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  let account;
  try { account = currentAccount(getDatabase(), accountCredential((await headers()).get("cookie"))); }
  catch { return <div className="page-content"><h1>Account unavailable</h1><p role="alert">We couldn’t open local storage. Try reloading this page.</p><Link href="/account">Try again</Link></div>; }
  if (!account) redirect("/login");
  return <div className="page-content"><div className="page-heading"><h1>Your account</h1><p>Signed in as <strong>{account.username}</strong></p></div>
    <section className="placeholder"><h2>Account groups</h2><p>Account groups are not available yet. Your account is ready; existing shared watchlists still use separate legacy access.</p>
      <Link href="/">Open legacy group access</Link><AccountForm operation="logout" /></section></div>;
}
