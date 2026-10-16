import type { ItemProjection } from "../../lib/metadata/types";
/** SYNTHETIC / DOCUMENTED-NOT-LIVE-TESTED. Invented projections, no captured responses. */
export const fixtureStatus = "synthetic/documented-not-live-tested";
export const youtube: ItemProjection = { externalId: "YtFixture01", title: "A synthetic comedy", contentType: "youtube", duration: { seconds: 1440, meaning: "full_item", verified: true }, genres: [], watchUrl: "https://www.youtube.com/watch?v=YtFixture01" };
export const episodic: ItemProjection = { externalId: "1002", title: "Synthetic series", contentType: "series", duration: { seconds: null, meaning: "unknown", verified: false }, genres: ["Comedy"], sourceUrl: "https://www.kinopoisk.ru/series/1002/" };
export const ambiguous: ItemProjection[] = [{ externalId: "1001", title: "Synthetic title", year: 2001, contentType: "movie", coverUrl: "https://example.invalid/one.jpg" }, { externalId: "1002", title: "Synthetic title", year: 2021, contentType: "series" }];
