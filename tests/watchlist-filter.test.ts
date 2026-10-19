// @vitest-environment node
import {expect,it} from "vitest";
import {parseWatchlistFilter} from "../lib/watchlist-filter";
it.each([undefined,"all"])("defaults %s to the shared All view",value=>expect(parseWatchlistFilter(value)).toEqual({filter:"all"}));
it("recognizes only the exact Mine enum without identity claims",()=>expect(parseWatchlistFilter("mine")).toEqual({filter:"mine"}));
it.each(["", "Mine", " mine", "mine ", "other", "all' OR 1=1--", ["mine"], ["mine","all"], ["mine","mine"],null,{},1])("safely rejects unsupported/array input %j with a fixed notice",value=>expect(parseWatchlistFilter(value)).toEqual({filter:"all",notice:"That watchlist filter is not supported. Showing all titles."}));
