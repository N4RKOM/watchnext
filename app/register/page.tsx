import Link from "next/link";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default function RegisterPage() {
  return <div className="page-content"><div className="page-heading"><h1>Create an account</h1><p>Keep a private account with a username and password. No email needed.</p></div>
    <section className="placeholder"><AccountForm operation="register" /><p>Already registered? <Link href="/login">Sign in</Link>.</p><Link href="/">Return to WatchNext</Link></section></div>;
}
