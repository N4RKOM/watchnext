"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function DetailError() {
  const router = useRouter(), [pending, start] = useTransition();
  return <div className="page-content"><h1>Couldn’t load this title</h1><p>Please try again. Your saved information hasn’t been changed.</p><button className="button" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "Retrying…" : "Try again"}</button><p role="status">{pending ? "Loading title details…" : ""}</p><Link href="/watchlist">Back to watchlist</Link></div>;
}
