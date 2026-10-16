import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { readWatchlist } from "../../lib/watchlist";
import { AccessError } from "../../lib/sessions";
import { AccessErrorMessage } from "../components/access-error";
import { WatchlistContent } from "../watchlist/watchlist-view";
import { WatchlistLoadError } from "../watchlist/load-error";
import { contributionAction } from "../watchlist/contribution-actions";
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  try { return <WatchlistContent view={readWatchlist(getDatabase(), await getGroupRequest(), true)} archived contributionAction={contributionAction} />; }
  catch (error) { return error instanceof AccessError ? <AccessErrorMessage /> : <WatchlistLoadError archived />; }
}
