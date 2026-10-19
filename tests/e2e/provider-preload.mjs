// Only test-owned production startup imports this outbound transport substitute.
// Core adapters, actions, review authority and database mutations remain real.
const realFetch = globalThis.fetch;
import { existsSync,writeFileSync,appendFileSync } from "node:fs";
import { dirname,join } from "node:path";
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if(["https://www.googleapis.com","https://kinopoiskapiunofficial.tech"].includes(url.origin))appendFileSync(join(dirname(process.env.WATCHNEXT_DATABASE_PATH),"provider-request-count"),"request\n");
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  if (url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/search") {
    const token=url.searchParams.get("pageToken"),number=token?Number(token.replace("page","")):1;
    return json({items:url.searchParams.get("q")==="empty"&&number===1?[]:[{id:{kind:"youtube#video",videoId:"YtFixture01"}},{id:{kind:"youtube#video",videoId:"YtExact0001"}}],nextPageToken:`page${number+1}`,...(number>1?{prevPageToken:`page${number-1}`}:{})});
  }
  if (url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/videos") {
    const id = url.searchParams.get("id");
    if (id === "YtQuota0001") return json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);
    if (id === "YtNetwork01") throw new TypeError("Synthetic outbound network unavailable");
    if (id === "YtFailure01") return json({}, 503);
    if(id === "YtHolding01"){
      // Test-only outbound transport gate; no application endpoint or auth bypass.
      const root=dirname(process.env.WATCHNEXT_DATABASE_PATH),ready=join(root,"provider-waiting"),release=join(root,"provider-release");
      writeFileSync(ready,"ready");const deadline=Date.now()+6000;
      while(!existsSync(release)){if(Date.now()>deadline)throw new Error("Synthetic held provider release timed out");await new Promise(done=>setTimeout(done,20));}
      writeFileSync(join(root,"provider-returned"),"normal response");
    }
    return json({items:id.split(",").filter(value=>["YtFixture01","YtExact0001","YtMissing01","YtHolding01"].includes(value)).map(value=>({id:value,snippet:{title:value==="YtExact0001"?"Synthetic exact video":value==="YtMissing01"?"Synthetic unknown runtime":"Synthetic YouTube proposal",channelTitle:"Synthetic channel",thumbnails:{default:{url:`https://i.ytimg.com/vi/${value}/${value==="YtExact0001"?"broken":"default"}.jpg`}},liveBroadcastContent:value==="YtMissing01"?"upcoming":"none"},contentDetails:{duration:value==="YtExact0001"?"PT4M5S":"PT2M"},status:{privacyStatus:"public",uploadStatus:"processed"}}))});
  }
  if (url.origin === "https://kinopoiskapiunofficial.tech") {
    const film = { kinopoiskId: 1001, nameRu: "Synthetic ambiguous film", year: 2001, type: "FILM", filmLength: 120, genres: [{ genre: "Drama" }], posterUrl: "https://kinopoiskapiunofficial.tech/images/posters/kp/1001.jpg", posterUrlPreview: "https://kinopoiskapiunofficial.tech/images/posters/kp_small/1001.jpg" };
    const unknown = { ...film, kinopoiskId: 1002, year: 2020, type: "DOCUMENTARY", filmLength: null };
    const series={...film,kinopoiskId:1003,nameRu:"Synthetic episodic series",type:"TV_SERIES",filmLength:900,posterUrl:null,posterUrlPreview:null};
    if (url.pathname === "/api/v2.2/films") return json({ totalPages: 8, items: url.searchParams.get("keyword")==="empty"&&url.searchParams.get("page")==="1"?[]:[film, unknown,series] });
    if (url.pathname === "/api/v2.2/films/1003") return json(series);
    if (url.pathname === "/api/v2.2/films/1002") return json(unknown);
    if (url.pathname === "/api/v2.2/films/1001") return json(film);
    return json({}, 404);
  }
  if (url.origin === process.env.WATCHNEXT_APP_ORIGIN) return realFetch(input, init);
  throw new TypeError("Test fixture blocks external network");
};
