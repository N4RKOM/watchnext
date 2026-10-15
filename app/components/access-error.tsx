import Link from "next/link";

export function AccessErrorMessage() {
  return <div className="page-content">
    <div className="page-heading"><h1>Group access unavailable</h1><p className="page-introduction">This invitation or session isn’t available. Ask your friend for a valid invite link.</p></div>
    <Link className="button" href="/">Return to Group entry</Link>
  </div>;
}
