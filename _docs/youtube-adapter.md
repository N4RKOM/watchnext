# YouTube server adapter (#17)

Implementation is **documented and synthetically/mock verified**, not authenticated/live-tested. Primary docs rechecked **October 16, 2026**: [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [video resource](https://developers.google.com/youtube/data/reference/rest/v3/videos), [errors](https://developers.google.com/youtube/data/reference/rest/v3/errors), [Developer Policies III.E](https://developers.google.com/youtube/terms/developer-policies) and [Google system parameters](https://docs.cloud.google.com/apis/docs/system-parameters). No secrets were inspected, accounts created, services purchased or authenticated provider requests made. Actual project access/quota remains unverified.

## Configuration and boundary

Set optional **server-only `YOUTUBE_API_KEY`** in an untracked `.env.local` or server environment, using your own appropriately restricted YouTube Data API v3 project key. Never use `NEXT_PUBLIC_` or commit a key. `.env.example` contains a commented empty setting only. Missing, blank or control/whitespace-containing configuration returns `not_configured` without fetch; manual entry stays independent.

Application server code imports `configuredYoutubeProvider` from `lib/metadata/youtube.ts`, which imports `server-only` and reads configuration only when called. A real isolated Next build fixture confirms a Client Component import is rejected. The Node-only `youtube-transport.ts` implementation accepts injected configuration/transport for tests and imports native timers; it is not an alternate client API. Pure parser/types remain safe to reuse without configuration. No configuration or credential is part of normalized results or client props.

Use `youtubeVideoId(input)` from `youtube-input.ts` before the #16 `lookupMetadata(provider, {kind: "detail", externalId}, context)` call. The parser accepts an exact canonical 11-character ID or these HTTPS single-video forms:

- `youtube.com`, `www.youtube.com`, `m.youtube.com`: `/watch?v=ID` or `/shorts/ID`.
- `youtu.be/ID`.

Ordinary timestamps/tracking and a watch link's additional playlist context do not alter identity or runtime. Playlist-only/channel links are unsupported. Exact host allowlisting rejects lookalikes/subdomains; credentials, explicit ports (including 443), controls/whitespace/backslashes, normalized-away paths, extra path segments and missing/invalid/duplicate `v` parameters are rejected. Short/shorts paths reject an additional `v` parameter to avoid competing identities. Unsupported paths/redirect aliases are not resolved. Invalid parser input returns null; the caller offers correction/manual entry without lookup. The adapter independently rejects invalid detail IDs and all search queries before transport. No keyword search or extra quota-consuming fallback occurs.

## Request and mapping

Exactly one GET is made to fixed `https://www.googleapis.com/youtube/v3/videos` with the validated `id` and `part=snippet,contentDetails,status,liveStreamingDetails`. The API key uses Google's documented **`X-Goog-Api-Key` header**, keeping it out of request URLs and routine URL traces. Redirects are errors; cache is `no-store`, credentials are omitted and no referrer is sent. Never log transport arguments, headers, bodies or exceptions, or enable external header/network tracing around real keys. Existing application framework privacy launchers remain required when serving the app.

The matching single resource maps title, `youtube` type, optional supplied thumbnail, and canonical source/watch links. A thumbnail is passed through central URL validation; unsafe supplied values are removed with an issue. Missing cover/genres is optional, and category IDs never imply genres or moods. No description/channel/personal data is projected. Multiple resources, mismatched ID, missing/non-array items or malformed successful JSON produce `invalid_metadata`; an empty items array is `not_found_or_inaccessible`. A private/deleted/failed/rejected resource, if supplied, uses that same unavailable result, without asserting which underlying cause public access proved. Readable metadata is not proof of playback availability or permission to embed/download media.

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
