// Only test-owned production startup imports this outbound transport substitute.
// Core adapters, actions, review authority and database mutations remain real.
const realFetch = globalThis.fetch;
import { existsSync,writeFileSync } from "node:fs";
import { dirname,join } from "node:path";
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
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
    }else if (id !== "YtFixture01") return json({ items: [] });
    return json({ items: [{ id, snippet: { title: "Synthetic YouTube proposal", liveBroadcastContent: "none" }, contentDetails: { duration: "PT2M" }, status: { privacyStatus: "public", uploadStatus: "processed" } }] });
  }
  if (url.origin === "https://kinopoiskapiunofficial.tech") {
    const film = { kinopoiskId: 1001, nameRu: "Synthetic ambiguous film", year: 2001, type: "FILM", filmLength: 120, genres: [{ genre: "Drama" }], posterUrl: "https://kinopoiskapiunofficial.tech/images/posters/kp/1001.jpg", posterUrlPreview: "https://kinopoiskapiunofficial.tech/images/posters/kp_small/1001.jpg" };
    const unknown = { ...film, kinopoiskId: 1002, year: 2020, type: "DOCUMENTARY", filmLength: null };
    if (url.pathname === "/api/v2.2/films") return json({ totalPages: 1, items: [film, unknown] });
    if (url.pathname === "/api/v2.2/films/1002") return json(unknown);
    if (url.pathname === "/api/v2.2/films/1001") return json(film);
    return json({}, 404);
  }
  if (url.origin === process.env.WATCHNEXT_APP_ORIGIN) return realFetch(input, init);
  throw new TypeError("Test fixture blocks external network");
};
