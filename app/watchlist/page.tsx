import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { readWatchlist } from "../../lib/watchlist";
import { AccessError } from "../../lib/sessions";
import { AccessErrorMessage } from "../components/access-error";
import { WatchlistContent } from "./watchlist-view";
import { WatchlistLoadError } from "./load-error";
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  try { return <WatchlistContent view={readWatchlist(getDatabase(), await getGroupRequest())} />; }
  catch (error) { return error instanceof AccessError ? <AccessErrorMessage /> : <WatchlistLoadError />; }
}
