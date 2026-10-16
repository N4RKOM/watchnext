import { Placeholder } from "../components/placeholder";
import Link from "next/link";

export default function WatchlistPage() {
  return <><Placeholder
    title="Your watchlist"
    introduction="All the things you’ve been meaning to watch, in one place."
    heading="Make room for your next favorites"
    description="Your group’s movies, series, anime, and YouTube videos will live here. You can add titles now; browsing the shared list is coming soon."
  /><Link className="button" href="/watchlist/add">Add title</Link></>;
}
