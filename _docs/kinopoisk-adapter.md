# Kinopoisk API Unofficial adapter (#18, #37)

Current account/discovery delivery and historical boundaries are mapped in [enhancement-audit.md](enhancement-audit.md). Historical #16-#19 manual-runtime/no-cover statements describe that adapter stage. #36-#38 supersede them with title/link search, available-field automatic review and allowlisted previews. Selected Kinopoisk FILM integral filmLength is interpreted by the app as minutes, editable, not provider-confirmed units. Unknown/episodic runtime stays manual; no live access/rights claim is made.

**Third-party Unofficial service, not an official Кинопоиск API or streaming access.** Primary [OpenAPI contract](https://kinopoiskapiunofficial.tech/documentation/api/openapi.json) and [Swagger documentation](https://kinopoiskapiunofficial.tech/documentation/api/) rechecked **October 19, 2026**; the contract still reports version **2.0.1**. The Swagger page itself is a JavaScript shell; field/range evidence comes from OpenAPI. Implementation is **documented and synthetically/mock verified**, not authenticated/live-tested. No provider credentials were inspected, account registered, purchase made or original-site page scraped. Actual account allowance/access and image/persistence rights remain unverified; free access is not promised.

## Configuration and server boundary

Optional **`KINOPOISK_UNOFFICIAL_API_KEY`** belongs only in an untracked `.env.local` or server environment. `.env.example` has a commented empty setting. Never use a `NEXT_PUBLIC_` key or commit credentials. Outer whitespace is trimmed; missing/blank keys or remaining controls/whitespace return #16 `not_configured` without fetch. Manual entry remains available.

Application server code imports `configuredKinopoiskUnofficialProvider` from `lib/metadata/kinopoisk.ts`. That entry imports `server-only` and reads the setting only when called. A real isolated Next build rejects a Client Component import. Node-only `kinopoisk-transport.ts` accepts injected configuration/fetch for offline tests and uses native timers; it is not a client API. Pure input helpers contain no configuration.

Use the existing `lookupMetadata(provider, query, {signal?, now?})` normalized boundary. Server code supplies the configured provider; never accept an API key/provider authority from a form. The adapter does no database/cache write, save or UI work. Existing application privacy launchers remain required while serving the app; do not enable raw header/request/body diagnostics around real credentials.

## Fixed requests and explicit selection

- Search: exactly `https://kinopoiskapiunofficial.tech/api/v2.2/films?keyword=<encoded trimmed text>&page=<server page>`. Page defaults to 1; protected review handles select canonical integers 1–20, bounded by current `totalPages`. Text must be 1–200 Unicode code points and contain no controls; nontext/empty/over-bound input fails before configuration/fetch. URLSearchParams encodes text; no user URL becomes a destination.
- Detail: exactly `https://kinopoiskapiunofficial.tech/api/v2.2/films/<ID>`. Input is a canonical positive decimal string within **1–15000000**, matching the current endpoint range. No leading zeros, coercion, URL/path, signs or fractions. Numeric response IDs must be safe integers in that range and match selected detail identity before string conversion is trusted.

GET requests use only the fixed origin/path and documented **`X-API-KEY` header**. Redirects are errors; cache is `no-store`, cookies are omitted and no referrer is sent. The key is never put in a request URL. There are no retries or background pagination requests. OpenAPI describes at most 20 results per page; an oversized successful search page is rejected rather than silently truncated.

Search results become distinct canonical candidates with title/year/type, validated genres, safe source link and actual allowlisted poster hints, unknown duration and trusted retrieval provenance. Search never fetches each candidate detail. Missing `totalPages` is tolerated only for a first-page legacy response with no navigation; malformed/inconsistent totals fail safely. Duplicate IDs retain their first candidate; malformed identities remain unusable and are removed by #16 with its omission indicator (or a safe error when no valid candidate exists). Ambiguous names stay separate; an empty items array is honest `no_match`. A caller must explicitly select an identity and make a separate detail lookup. Neither search nor detail adds contributors/titles or grants save authority.

## Conservative field mapping

The first valid trimmed `nameRu`, `nameOriginal`, then `nameEn` supplies title (1–200 Unicode code points, no controls). All-invalid/absent names stay null/incomplete. Supplied year/genre labels pass through #16 bounds/deduplication; malformed fields remain absent or explicit issues. `FILM` maps to movie, `TV_SERIES`/`MINI_SERIES` to series; other types remain unsupported/incomplete. An anime genre never implies anime classification. #19 owns explicit correction to anime/type, moods, numbering and runtime.

The current `Film.filmLength` schema is merely a nullable integer with an example; it does **not** establish units or typical-episode meaning. Under #37 delegated authority, selected **FILM detail only** interprets positive integral numeric filmLength 1–1440 as minutes, exactly multiplied by 60 within 1–86400 seconds. The normalized duration carries `interpretation: app_minutes_to_seconds`: an editable app convention, **not provider-confirmed units or live verification**. Search durations and every episodic/unknown-type duration stay null. Null, zero, negative, fractional, excessive and string values stay manual-required; no series-total-as-episode inference is performed. Episodic metadata adds #16 numbering/confirmed typical duration requirements. Known source `webUrl` is centrally validated, never treated as a playable watch link. Watch links remain null. Unsafe/credential-bearing source URLs are removed with issues.

Search chooses actual safe `posterUrlPreview` then `posterUrl`; detail chooses `posterUrl` then preview. The shared validator permits HTTPS only, normal port, no credentials/fragments/queries/controls/traversal, and published paths on `kinopoiskapiunofficial.tech` or `avatars.mds.yandex.net`; see [discovery contract](kinopoisk-discovery.md). Unsafe/missing URLs become null without blocking selection. No URL synthesis, HTTP upgrade or image-byte fetch/cache occurs. Remote image presentation/fallback belongs to #38. Actual rights remain unverified; no inspected material established an explicit blanket preview ban for this local academic scope. No mood, progress, completion, rating, notes or unrelated payload fields are copied. Every result still requires review/moods, even after manual completion of missing fields.

## Errors, privacy and deadlines

| Provider result | Normalized safe code |
| --- | --- |
| Invalid input / HTTP 400 | `invalid_query` |
| Missing/bad local configuration, HTTP 401, HTTP 403 account/provider restriction | `not_configured` |
| HTTP 402 allowance exhausted | `quota_exhausted` |
| HTTP 404 | `not_found_or_inaccessible` |
| HTTP 429 | `rate_limited` |
| Other non-success including 5xx/refused response redirect status | `provider_error` |
| Malformed successful JSON/search envelope/detail or mismatched ID | `invalid_metadata` |
| Transport rejection, including native refused redirect | `network_error` |
| Caller cancellation | `cancelled` |
| Owned deadline | `timeout` |

Status mapping works with empty/non-JSON bodies. Error bodies are discarded, never parsed for display or logged. A provider/proxy echo of the configured key into projected fields is rejected before normalization. #16 supplies fixed safe messages, retry guidance/manual fallback and no raw internal exceptions/paths. 403 is a setup/account restriction outcome, not evidence about a film's streaming availability. Rate-limit Retry-After accepts whole delta seconds 0–86400; unsupported/date/absent values remain null, with no guessed reset.

The default owned deadline is **10 seconds**; test/server overrides must be whole milliseconds 1–30000. It covers fetch and streamed parsing, capped at 262144 bytes (declared and actual) and 20 search items. A separate native provider pool admits 2 active/8 queued calls, with a 30-second queue deadline; all outcomes release capacity. The service applies a separate 20-lookup/context/15-minute budget, not a claim about provider quota. An owned AbortController forwards caller cancellation; a race also bounds injected transports/body readers that ignore abort. Timers/listeners are cleaned on every outcome. No unbounded retry, quota evasion or fallback provider is implemented. These paging/deadline/mapping choices use the October 15 delegated authority in [plan.md](plan.md), not a new explicit user approval. Native fetch/URL/AbortController/timers and existing tests suffice; no dependencies added or YouTube changes required.

## Provenance and #19 handoff

Normalized detailed items carry provider-acquired fields, trusted retrieval time and **`provider_policy_unverified` / `verify_policy_before_persistence`**, with no invented provider-mandated freshness deadline. Synthetic success does not verify account entitlement, policy or image rights. The delivered [#19 lifecycle](metadata-lifecycle.md) records a delegated local academic metadata-snapshot choice at the review/storage boundary: `academic_local_snapshot_30_days`, real provenance/refresh/delete, editable runtime interpretation/corrections and safe remote poster URL snapshots. Configured lookup/save remains functional; uncertain external terms are disclosed rather than converted into a permanent save ban or verified-license claim. No persistence is performed inside this adapter itself. See the [normalized contract](metadata-contract.md) and [research](metadata-providers.md).

## Offline verification

`tests/metadata/kinopoisk.test.ts` labels fixtures **synthetic/documented-not-live-tested** and uses fake transport/clock only. It covers ambiguous/empty/deduplicated search, movie/series/unknown/anime-related detail, missing fields, safe source handling, runtime uncertainty, input/identity bounds, malformed responses, each status/error, cancellation/timeout/body stalls, configuration, provenance and credential exclusion. Dummy keys are generated only in memory; credential assertions use booleans/counts so diagnostics do not print keys/requests. `kinopoisk-boundary.test.ts` proves the configured client-import rejection with an isolated negative Next fixture and automatic cleanup. No internet/key/account/database/browser is required. Run `pnpm exec vitest run tests/metadata/kinopoisk.test.ts tests/metadata/kinopoisk-boundary.test.ts --maxWorkers 2`.

## Protected paging and verification (#37)

`beginReview`, `pageReview` and explicit candidate selection reuse the actual session/group/member/account membership-generation boundary before and after awaits. Opaque handles hold provider/query/page authority server-side. New same-provider queries supersede their prior chain. Each chain permits five total page visits (including previous), fixed ten-minute lifetime and at most twenty context snapshots; numeric pages never become browser authority. Both providers retain their own chain discriminator and admission budget. Search/detail snapshots are physically deleted at the stricter review deadline; saved imported title/type/duration/genres/source/poster fields retain actual retrieval plus the app-chosen thirty-day refresh/delete deadline. User corrections/history are independent.

`tests/metadata/kinopoisk-discovery.test.ts` and `kinopoisk-reviews.test.ts` add synthetic runtime/poster/limits/paging/selected-detail/save/physical-expiry tests. `tests/accounts/consumers.test.ts` executes the real adapter/review service across foreign sessions, away/back and removal/rejoin during pending paging. The supported production E2E keeps the unknown-type/manual-duration case and adds selected FILM 120→7200 seconds with its actual safe poster. This is offline/mocked evidence, not authenticated API access. No dependencies or migrations were added.
