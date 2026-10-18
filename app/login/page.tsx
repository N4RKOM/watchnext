import Link from "next/link";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <div className="page-content"><div className="page-heading"><h1>Sign in</h1><p>Use your account username and password.</p></div>
    <section className="placeholder"><AccountForm operation="login" /><p>New here? <Link href="/register">Create an account</Link>.</p><Link href="/">Return to WatchNext</Link></section></div>;
}
