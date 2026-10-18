import Link from "next/link";

export function AccessErrorMessage() {
  return <div className="page-content">
    <div className="page-heading"><h1>Group access unavailable</h1><p className="page-introduction">Your selected access mode, membership or invitation is unavailable. For account groups, sign in and select an active group. Legacy groups need a valid invitation.</p></div>
    <Link className="button" href="/account">Open account groups</Link>{" "}
    <Link className="button" href="/">Return to Group entry</Link>
  </div>;
}
