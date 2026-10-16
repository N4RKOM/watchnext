"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
export function WatchlistLoadError({ archived = false }: { archived?: boolean }) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  return <div className="page-content"><h1>{archived ? "Archive" : "Your watchlist"}</h1><section className="placeholder"><h2>{archived ? "Couldn’t load your archive" : "Couldn’t load your watchlist"}</h2><p>Please try again. Your saved titles haven’t been changed.</p>
    <button className="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Retrying…" : "Try again"}</button><p role="status">{pending ? archived ? "Loading your archive…" : "Loading your watchlist…" : ""}</p>
  </section></div>;
}
