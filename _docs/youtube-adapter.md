# YouTube server adapter (#17 / #36)

Implementation is **documented and synthetically/mock verified**, not authenticated/live-tested. Primary docs rechecked **October 19, 2026**: [search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [video resource](https://developers.google.com/youtube/data/reference/rest/v3/videos), [current quota overview](https://developers.google.com/youtube/data/determine_quota_cost), [errors](https://developers.google.com/youtube/data/reference/rest/v3/errors), [Developer Policies III.E.4](https://developers.google.com/youtube/terms/developer-policies) and [Google system parameters](https://docs.cloud.google.com/apis/docs/system-parameters). No secrets were inspected, accounts created, services purchased or authenticated provider requests made. Actual project access/quota remains unverified.

## Configuration and boundary

Set optional **server-only `YOUTUBE_API_KEY`** in an untracked `.env.local` or server environment, using your own appropriately restricted YouTube Data API v3 project key. Never use `NEXT_PUBLIC_` or commit a key. `.env.example` contains a commented empty setting only. Missing, blank or control/whitespace-containing configuration returns `not_configured` without fetch; manual entry stays independent.

Application server code imports `configuredYoutubeProvider` from `lib/metadata/youtube.ts`, which imports `server-only` and reads configuration only when called. A real isolated Next build fixture confirms a Client Component import is rejected. The Node-only `youtube-transport.ts` implementation accepts injected configuration/transport for tests and imports native timers; it is not an alternate client API. Pure parser/types remain safe to reuse without configuration. No configuration or credential is part of normalized results or client props.

Use `youtubeVideoId(input)` from `youtube-input.ts` before the #16 `lookupMetadata(provider, {kind: "detail", externalId}, context)` call. The parser accepts an exact canonical 11-character ID or these HTTPS single-video forms:

- `youtube.com`, `www.youtube.com`, `m.youtube.com`: `/watch?v=ID` or `/shorts/ID`.
- `youtu.be/ID`.

Ordinary timestamps/tracking and a watch link's additional playlist context do not alter identity or runtime. Playlist-only/channel links are unsupported. Exact host allowlisting rejects lookalikes/subdomains; credentials, explicit ports (including 443), controls/whitespace/backslashes, normalized-away paths, extra path segments and missing/invalid/duplicate `v` parameters are rejected. Short/shorts paths reject an additional `v` parameter to avoid competing identities. Unsupported paths/redirect aliases are not resolved. Invalid parser input returns null; the caller offers correction/manual entry without lookup. Existing string review callers remain strict link/ID only. Explicit `youtubeLookupQuery({kind:'title',text})` accepts trimmed 1–200 Unicode code points without controls; supported IDs/links still become direct details, URL-like invalid inputs fail, and ordinary titles become search queries. No accidental title fallback occurs for rejected pasted URLs.

## Request and mapping

A strict link/ID makes one fixed `https://www.googleapis.com/youtube/v3/videos` request. A title page makes one fixed `/youtube/v3/search` request with `part=snippet,type=video,order=relevance,maxResults=10,q=<title>` and optional server-owned page token, followed by one videos-list batch for up to ten unique valid IDs, with `part=snippet,contentDetails,status,liveStreamingDetails`. Search order is preserved despite reordered batch resources; private/deleted/missing resources are omitted and duplicate/unrequested batch IDs fail safely. Empty/filtered pages do not invent videos or missing navigation. The API key uses Google's documented **`X-Goog-Api-Key` header**, keeping it out of request URLs and routine URL traces. Redirects are errors; cache is `no-store`, credentials are omitted and no referrer is sent. Never log transport arguments, headers, bodies or exceptions, or enable external header/network tracing around real keys. Existing application framework privacy launchers remain required when serving the app.

Matching resources map title, optional channelTitle, `youtube` type, provider-returned thumbnail, finite verified duration and canonical source/watch links. Thumbnail validation accepts only HTTPS `i.ytimg.com` with no credentials, fragments, nondefault ports or secret-bearing query keys; arbitrary/private/lookalike hosts become null without blocking text selection. No image URL is guessed or binary downloaded/cached. Missing cover/genres is optional, and category IDs never imply genres or moods. No description/private-owner data is projected. Direct detail still rejects multiple/mismatched IDs; an empty or inaccessible direct result is unavailable. Search candidates carry normalized optional duration/manual-field and actual retrieval/policy evidence. Readable metadata is not proof of playback availability or permission to embed/download media.

ISO runtime supports integral day/hour/minute/second forms (including `P1D`, `PT1H2M3S`), with no rounding. Positive whole seconds must fit the existing 1–86400 save bound. Fractional/negative/malformed/zero/missing/unsupported/over-bound lengths remain null and require manual confirmed duration. No timestamps reduce runtime. A known `snippet.liveBroadcastContent=none` is required to trust finite duration; live/upcoming/unknown/missing flags keep safe other suggestions but mark runtime uncertain. If `liveStreamingDetails` exists, a valid `actualEndTime` is additionally required. Thus completed broadcasts may use documented finite duration, while unfinished/uncertain broadcasts cannot turn a provisional length into trusted runtime. The adapter does not derive runtime from live start/end timestamps.

## Failure and cancellation mapping

| Outcome | #16 code |
| --- | --- |
| Unsupported query/invalid canonical ID | `invalid_query`, no fetch |
| Missing/bad key configuration or invalid internal timeout setting | `not_configured`, no fetch |
| 403 reason `quotaExceeded` / `dailyLimitExceeded` | `quota_exhausted` |
| 429, or 403 reason `rateLimitExceeded` / `userRateLimitExceeded` | `rate_limited` |
| 400/401/other 403 | `not_configured` (request/account/config rejected; raw details hidden) |
| 404 or empty/inaccessible resource | `not_found_or_inaccessible` |
| Other non-success status including 5xx | `provider_error` |
| Invalid successful JSON/envelope/resource identity | `invalid_metadata` |
| Transport rejection, including refused redirect | `network_error` |
| Caller AbortSignal cancellation | `cancelled` |
| Adapter-owned deadline, including stalled body reading | `timeout` |

Reason matching uses only allowlisted strings, never provider message text. Status-based failures work even with empty/non-JSON error bodies. A configured key echoed into selected fields makes the response unusable rather than returning the credential. Rate-limit `Retry-After` accepts only integer delta seconds 0–86400; absent/date/fractional/over-bound values remain null, with no guessed reset. #16 supplies fixed safe messages, retry policy and manual fallback. No automatic retry or quota evasion is implemented.

The default deadline is **10 seconds**; injected test/server overrides must be whole milliseconds 1–30000. This bounds both fetch and response parsing. An owned AbortController forwards caller cancellation to transport; racing cancellation/deadline also bounds an injected transport that ignores its signal. Timers/listeners are removed after every result. Exceptions are caught without logging or returning internals. Cancellation wins over timeout when the caller is already aborted.

These URL/deadline/status defaults are delegated implementation choices under the October 15 autonomy directive in [plan.md](plan.md), not new explicit user approvals. Native fetch/URL/AbortController/timers and existing TypeScript/Vitest suffice; no dependencies added. Header credentials reduce routine trace exposure; the finite deadline and conservative live handling preserve reliable manual fallback.

## Delivered review/freshness boundary

All items pass through the [#16 normalized contract](metadata-contract.md), with accepted-field provenance and trusted retrieval time. Public YouTube suggestions carry the retrieval-plus-30-calendar-days refresh-or-delete deadline; controlled-clock tests verify it. This is an upper lifecycle deadline, not a freshness or playable-content guarantee. Review and manual fixed moods are still required even for `available` items.

This adapter itself performs no durable writes/UI. Delivered [#19 lifecycle](metadata-lifecycle.md) owns bound review/provenance, independent corrections/history, real refresh/deletion and safe source/watch links. YouTube destinations remain labeled external YouTube/video links; public data is not licensed streaming access. Follow [branding guidance](https://developers.google.com/youtube/terms/branding-guidelines) when changing display. API-key account access/quotas and live availability remain unverified, and no failure blocks manual entry.

## Offline verification

`tests/metadata/youtube.test.ts` uses **synthetic/documented-not-live-tested** resource projections and fake transport/clock only. Tests generate ephemeral dummy keys in memory, assert credential checks as booleans and never print request arguments or keys. They cover supported/invalid inputs, fixed endpoint/parts/header configuration, finite/unknown duration and live semantics, response validation, safe errors/retries, aborted/stalled work and absence of credential logs. `youtube-boundary.test.ts` compiles an isolated negative client-import fixture and cleans it up. No key, internet, normal database, account or browser is required. Run `pnpm exec vitest run tests/metadata/youtube.test.ts tests/metadata/youtube-boundary.test.ts --maxWorkers 2`.

## Discovery bounds and #38 handoff

Published October 19 quota evidence: search.list has a separate default 100-calls/day bucket at one per search, including each explicitly requested additional page; videos.list costs one unit. One nonempty search page therefore spends one search call plus one detail-list unit. Actual Google project access/allocation is unverified; there is no historical 100-units-per-search assumption or entitlement/license claim. Optional server key/manual fallback remains unchanged.

Native process-local defaults are two active logical YouTube lookups, eight waiting, a 30-second queue deadline, and one shared ten-second search-plus-batch deadline after admission. Cancellation/timeout releases admission and prevents late enrichment. Each response stream is capped at 256 KiB; both item lists at ten (direct detail at one), so a nonempty page reads at most 512 KiB. Application review/select/page/refresh calls share twenty admitted YouTube logical lookups per authorized context/15-minute window, with at most 2048 expiring counter keys. Failed admitted calls count; limits reset on process restart and do not represent Google quota or distributed protection. No automatic retries, crawling or key rotation is used.

See [discovery service contract](youtube-discovery.md) for opaque handles, shared five-request paging chains, physical ten-minute expiry, actual selected-detail retrieval and future action signatures. #38 owns title search controls/cards/autofill/previews; existing link lookup UI remains unchanged here. Candidate channel/duration/image data is temporary; no durable channel column was added. Saved provider fields retain thirty-day refresh/delete and genuine user-correction ownership.
