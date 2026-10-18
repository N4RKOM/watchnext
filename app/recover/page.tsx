import Link from "next/link";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default function RecoveryPage() {
  return <div className="page-content"><div className="page-heading"><h1>Reset your password</h1><p>Use your username and the private recovery code you saved. This signs out every session for this account and replaces the code.</p></div>
    <section className="placeholder"><AccountForm operation="recover" /><p>If you have lost both your password and recovery code, there is no email or support bypass. We cannot retrieve either secret.</p><Link href="/login">Return to sign in</Link></section></div>;
}
