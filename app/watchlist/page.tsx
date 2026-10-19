import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { readWatchlist } from "../../lib/watchlist";
import { AccessError } from "../../lib/sessions";
import { AccessErrorMessage } from "../components/access-error";
import { WatchlistContent } from "./watchlist-view";
import { parseWatchlistFilter } from "../../lib/watchlist-filter";
import { WatchlistReadBoundary } from "./read-boundary";
import { WatchlistLoadError } from "./load-error";
export const dynamic = "force-dynamic";

export default async function WatchlistPage({searchParams}: {searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  const parameters=await searchParams;
  const requested=Object.keys(parameters??{}).some(key=>key.startsWith("filter["))?[]:parameters?.filter;
  try { const view=readWatchlist(getDatabase(),await getGroupRequest(),false,requested);const content=<WatchlistContent view={view}/>;return view.canFilter?<WatchlistReadBoundary>{content}</WatchlistReadBoundary>:content; }
  catch (error) { return error instanceof AccessError ? <AccessErrorMessage /> : <WatchlistLoadError filter={parseWatchlistFilter(requested).filter}/>; }
}
