export type WatchlistFilter = "all" | "mine";
export function parseWatchlistFilter(value:unknown):{filter:WatchlistFilter;notice?:string}{
  if(value===undefined||value==="all")return{filter:"all"};
  if(value==="mine")return{filter:"mine"};
  return{filter:"all",notice:"That watchlist filter is not supported. Showing all titles."};
}
