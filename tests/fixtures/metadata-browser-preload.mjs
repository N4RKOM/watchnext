// Test-only transport injection. Production launchers never import this file.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/videos") {
    if (url.searchParams.get("id") === "YtQuota0001") return json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);
    if (url.searchParams.get("id") !== "YtFixture01") return json({ items: [] });
    return json({ items: [{ id: "YtFixture01", snippet: { title: "Browser YouTube video", liveBroadcastContent: "none" }, contentDetails: { duration: "PT2M" }, status: { privacyStatus: "public", uploadStatus: "processed" } }] });
  }
  if (url.origin === "https://kinopoiskapiunofficial.tech" && url.pathname.startsWith("/api/v2.2/films")) {
    const film = { kinopoiskId: 1001, nameRu: "Browser shared title", year: 2001, type: "FILM", filmLength: 120, genres: [{ genre: "Drama" }], webUrl: "https://www.kinopoisk.ru/film/1001/", posterUrl: "https://example.invalid/never-import.jpg" };
    if (url.pathname === "/api/v2.2/films") return json({ items: [film, { ...film, kinopoiskId: 1002, year: 2020, type: "TV_SERIES" }] });
    if (url.pathname === "/api/v2.2/films/1002") return json({ ...film, kinopoiskId: 1002, year: 2020, type: "TV_SERIES", filmLength: 2400 });
    if (url.pathname === "/api/v2.2/films/1001") return json(film);
    return json({}, 404);
  }
  if (url.origin === process.env.WATCHNEXT_APP_ORIGIN) return original(input, init);
  throw new Error("Synthetic browser fixture forbids external requests");
};
