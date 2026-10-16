# Kinopoisk API Unofficial adapter (#18)

**Third-party Unofficial service, not an official Кинопоиск API or streaming access.** Primary [OpenAPI contract](https://kinopoiskapiunofficial.tech/documentation/api/openapi.json) and [Swagger documentation](https://kinopoiskapiunofficial.tech/documentation/api/) rechecked **October 16, 2026**; the contract still reports version **2.0.1**. The Swagger page itself is a JavaScript shell; field/range evidence comes from OpenAPI. Implementation is **documented and synthetically/mock verified**, not authenticated/live-tested. No provider credentials were inspected, account registered, purchase made or original-site page scraped. Actual account allowance/access and image/persistence rights remain unverified; free access is not promised.

## Configuration and server boundary

Optional **`KINOPOISK_UNOFFICIAL_API_KEY`** belongs only in an untracked `.env.local` or server environment. `.env.example` has a commented empty setting. Never use a `NEXT_PUBLIC_` key or commit credentials. Outer whitespace is trimmed; missing/blank keys or remaining controls/whitespace return #16 `not_configured` without fetch. Manual entry remains available.

Application server code imports `configuredKinopoiskUnofficialProvider` from `lib/metadata/kinopoisk.ts`. That entry imports `server-only` and reads the setting only when called. A real isolated Next build rejects a Client Component import. Node-only `kinopoisk-transport.ts` accepts injected configuration/fetch for offline tests and uses native timers; it is not a client API. Pure input helpers contain no configuration.

Use the existing `lookupMetadata(provider, query, {signal?, now?})` normalized boundary. Server code supplies the configured provider; never accept an API key/provider authority from a form. The adapter does no database/cache write, save or UI work. Existing application privacy launchers remain required while serving the app; do not enable raw header/request/body diagnostics around real credentials.

## Fixed requests and explicit selection

- Search: exactly `https://kinopoiskapiunofficial.tech/api/v2.2/films?keyword=<encoded trimmed text>&page=1`. Text must be 1–200 Unicode code points and contain no controls; nontext/empty/over-bound input fails before configuration/fetch. URLSearchParams encodes text; no user URL becomes a destination.
- Detail: exactly `https://kinopoiskapiunofficial.tech/api/v2.2/films/<ID>`. Input is a canonical positive decimal string within **1–15000000**, matching the current endpoint range. No leading zeros, coercion, URL/path, signs or fractions. Numeric response IDs must be safe integers in that range and match selected detail identity before string conversion is trusted.

GET requests use only the fixed origin/path and documented **`X-API-KEY` header**. Redirects are errors; cache is `no-store`, cookies are omitted and no referrer is sent. The key is never put in a request URL. There are no retries or background pagination requests. OpenAPI describes at most 20 results per page; an oversized successful search page is rejected rather than silently truncated.

First-page results become distinct canonical candidates with only title/year/type hints and null cover. Duplicate IDs retain their first candidate; malformed identities remain unusable and are removed by #16 with its omission indicator (or a safe error when no valid candidate exists). Ambiguous names stay separate; an empty items array is honest `no_match`. A caller must explicitly select an identity and make a separate detail lookup. Neither search nor detail adds contributors/titles or grants save authority.

## Conservative field mapping

The first valid trimmed `nameRu`, `nameOriginal`, then `nameEn` supplies title (1–200 Unicode code points, no controls). All-invalid/absent names stay null/incomplete. Supplied year/genre labels pass through #16 bounds/deduplication; malformed fields remain absent or explicit issues. `FILM` maps to movie, `TV_SERIES`/`MINI_SERIES` to series; other types remain unsupported/incomplete. An anime genre never implies anime classification. #19 owns explicit correction to anime/type, moods, numbering and runtime.

The current `Film.filmLength` schema is still merely a nullable integer with an example; it does **not** establish units or typical-episode meaning. Thus even movie lengths remain unverified null runtime with manual confirmation required. No minutes conversion, zero/default runtime or series-total-as-episode inference is performed. Episodic metadata adds #16 numbering/confirmed typical duration requirements. Known source `webUrl` is centrally validated, never treated as a playable watch link. Watch links remain null. Unsafe/credential-bearing source URLs are removed with issues.

All poster/preview/cover URLs remain null in both search and details while image-display rights are unverified. A supplied image URL does not establish permission to display/cache it. No mood, progress, completion, rating, notes or unrelated payload fields are copied. Every result still requires review/moods, even after manual completion of missing fields.

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

The default owned deadline is **10 seconds**; test/server overrides must be whole milliseconds 1–30000. It covers fetch and parsing. An owned AbortController forwards caller cancellation; a race also bounds injected transports/body readers that ignore abort. Timers/listeners are cleaned on every outcome. No unbounded retry, quota evasion or fallback provider is implemented. These first-page/timeout/conservative-mapping choices use the October 15 delegated authority in [plan.md](plan.md), not a new explicit user approval. Native fetch/URL/AbortController/timers and existing tests suffice; no dependencies added or YouTube changes required.

## Provenance and #19 handoff

Normalized detailed items carry provider-acquired fields, trusted retrieval time and **`provider_policy_unverified` / `verify_policy_before_persistence`**, with no invented freshness deadline. Synthetic success does not verify account entitlement, policy or image rights. [#19](https://github.com/xiaodlb/watchnext/issues/19) owns explicit candidate/review UI, manual corrections, trusted save/restoration invocation, persisted provenance and verification gates before unverified acquired data can be stored/displayed long-term. If those gaps remain unresolved, preserve manual entry and user corrections rather than treating provider data as cleared. No persistence/policy enforcement is claimed here. See the [normalized contract](metadata-contract.md) and [research](metadata-providers.md).

## Offline verification

`tests/metadata/kinopoisk.test.ts` labels fixtures **synthetic/documented-not-live-tested** and uses fake transport/clock only. It covers ambiguous/empty/deduplicated search, movie/series/unknown/anime-related detail, missing fields, safe source handling, runtime uncertainty, input/identity bounds, malformed responses, each status/error, cancellation/timeout/body stalls, configuration, provenance and credential exclusion. Dummy keys are generated only in memory; credential assertions use booleans/counts so diagnostics do not print keys/requests. `kinopoisk-boundary.test.ts` proves the configured client-import rejection with an isolated negative Next fixture and automatic cleanup. No internet/key/account/database/browser is required. Run `pnpm exec vitest run tests/metadata/kinopoisk.test.ts tests/metadata/kinopoisk-boundary.test.ts --maxWorkers 2`.
