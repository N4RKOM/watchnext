import { createGroupAction } from "./actions/create-group";
import { CreateGroupForm } from "./components/create-group-form";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <p className="eyebrow">Good company. Great watching.</p>
        <h1>WatchNext</h1>
        <p className="page-introduction">Less deciding, more watching. Bring the things you want to watch together in one shared list.</p>
      </div>
      <section className="placeholder" aria-labelledby="account-entry"><h2 id="account-entry">Your private account</h2><p>Register or sign in with a username and password.</p><p><Link href="/register">Register</Link> · <Link href="/login">Sign in</Link> · <Link href="/account">Your account</Link></p></section>
      <section aria-labelledby="legacy-entry"><h2 id="legacy-entry">Legacy group access</h2><p>Existing shared watchlists use invitation links and trusted name profiles, separately from accounts.</p><CreateGroupForm action={createGroupAction} /></section>
    </div>
  );
}
