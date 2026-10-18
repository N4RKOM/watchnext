# Metadata provider research

Verified against public provider documentation on **October 15, 2026** for [issue #3](https://github.com/xiaodlb/watchnext/issues/3). No authenticated requests were made, credentials inspected, accounts created, or purchases made. All JSON below is synthetic, reduced to relevant fields, and contains invented titles/IDs or redacted values. It is not a captured live response.

## Result and chosen routes

| Source | Exact route | Verification result |
| --- | --- | --- |
| YouTube | Google's official YouTube Data API **v3**, `videos.list` by extracted video ID | **Documented but not live-tested**: public documentation supports the required route; no project API key was provided or tested. |
| Кинопоиск metadata | **Kinopoisk API Unofficial**, `kinopoiskapiunofficial.tech`, OpenAPI document version **2.0.1**, `/api/v2.2/films` search and `/api/v2.2/films/{id}` details | **Documented but not live-tested**: a concrete third-party route exists; token access, current account allowance, runtime semantics, and image-use terms still need verification. |
| Official Кинопоиск API | No official public metadata developer route established by this research | **Unavailable to this project**: no official API contract or access grant was found. This does not prove that private partner APIs do not exist. The third-party service must never be described as official. |

Use the two documented routes when configured and verified; otherwise keep manual entry available. A lookup failure must preserve the user's existing input and offer editable fields. API availability does not imply a playable film, streaming rights, or permission to scrape the original site.

## YouTube access, limits, and restrictions

Create a Google Cloud project, enable YouTube Data API v3, and create an API key for public read requests. OAuth access to private owner data is outside this project. Configure the eventual key only on the server, restrict it to the intended API, and never place it in a public `NEXT_PUBLIC_` variable or commit it. [Google credential setup](https://developers.google.com/youtube/registering_an_application)

Lookup request shape, with the credential deliberately omitted:

```text
GET https://www.googleapis.com/youtube/v3/videos
    ?part=snippet,contentDetails,status&id=<VIDEO_ID>&key=<REDACTED>
```

`videos.list` costs one quota unit. Google's overview currently documents a default 10,000-unit daily pool for endpoints other than the separate search/upload allocations; this project needs ID lookup, not keyword search. Requests, including invalid ones, consume quota. Check the actual project allocation before use. Treat this as a quota-based access route, not a paid-per-lookup plan: the cited setup documents require no purchase for this route and publish no per-request currency price. Additional quota follows Google's request/audit process, not an assumed paid upgrade. [Method](https://developers.google.com/youtube/v3/docs/videos/list), [quota overview](https://developers.google.com/youtube/v3/getting-started#quota), [quota extensions](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)

Imported public API metadata is non-authorized API data: Google's policy requires refresh or deletion within 30 calendar days. Future implementation must distinguish imported snapshots from user-authored notes/progress, refresh or clear expired provider fields, and keep manual entry usable offline. Do not download audiovisual media or treat metadata access as playback permission. [Developer policies, particularly III.E](https://developers.google.com/youtube/terms/developer-policies)

Show attribution/linking consistent with Google's branding rules when displaying YouTube data; the external watch destination remains YouTube. This research does not implement branding, retention, or a player. [Branding guidelines](https://developers.google.com/youtube/terms/branding-guidelines)

### YouTube input and failure handling

The table records research expectations. The delivered [#17 YouTube adapter](youtube-adapter.md), documented/mocked on October 16, 2026, specifies the exact implemented parsing, header-only key transport, live semantics and error mappings. Actual configured access remains unverified:

| Case | Expected handling |
| --- | --- |
| `youtube.com/watch?v=<id>`, `youtu.be/<id>`, `youtube.com/shorts/<id>` | Parse an allowlisted HTTPS URL, extract one video ID, then call the fixed Google API host. Ignore timestamp/tracking parameters for identity and duration. Never fetch an arbitrary pasted URL. |
| Wrong host, malformed URL, missing/invalid video ID, playlist/channel-only link | Explain that a single video link is required; do not call the provider. Keep manual entry available. |
| `items: []` or HTTP 404 | Metadata unavailable. A public-key lookup cannot reliably distinguish private, deleted, or otherwise inaccessible videos; do not claim a specific cause. |
| Missing server credential | Report lookup not configured without making an API request or exposing configuration. |
| HTTP 400/401/403 authentication or configuration failure | Return a safe setup/unavailable message; do not leak provider messages containing credentials. |
| HTTP 403, reason `quotaExceeded` | Report quota exhausted, preserve input, permit manual entry; do not loop or evade quota with extra projects. |
| Network timeout, rate limit, or 5xx | Report temporary failure; permit a deliberate retry and manual entry. |
| Missing, zero, malformed, indefinite, or unsupported duration; live/upcoming broadcast | Ask for a confirmed finite duration. Do not turn missing runtime into zero or guess its length. A live/upcoming flag must prevent trusting a provisional runtime. |

HTTP error envelopes and reason strings are documented by [Google's error reference](https://developers.google.com/youtube/v3/docs/errors); empty results and missing fields must also be handled defensively. The API resource defines ISO 8601 duration and live-broadcast metadata. [Video resource](https://developers.google.com/youtube/v3/docs/videos)

## Кинопоиск third-party access, limits, and restrictions

The selected service calls itself **Unofficial**. Register on its website to obtain a token, then send `X-API-KEY: <REDACTED>`. [Provider documentation](https://kinopoiskapiunofficial.tech/documentation/api/)

```text
GET https://kinopoiskapiunofficial.tech/api/v2.2/films?keyword=<ENCODED_TITLE>&page=1
GET https://kinopoiskapiunofficial.tech/api/v2.2/films/<SELECTED_ID>
X-API-KEY: <REDACTED>
```

The [provider homepage](https://kinopoiskapiunofficial.tech/) indexed notice states **500 requests/day for new users** and directs higher-limit requests to support. The [OpenAPI contract](https://kinopoiskapiunofficial.tech/documentation/api/openapi.json) documents a general **25 requests/second** cap and endpoint-specific limits. The [rates page](https://kinopoiskapiunofficial.tech/rates) requires JavaScript and exposed no pricing table to this text-based check. Consequently **free entitlement and exact paid prices are unverified**; do not promise permanent free access or purchase a plan. Confirm the signed-in account's allowance and terms before enabling the adapter.

No redistribution/image license or attribution grant was established from the inspected contract. An image URL is not proof of permission to cache or republish its bytes. Verify applicable provider/content terms before enabling cover display; leave covers absent if that cannot be established. Do not scrape Кинопоиск, bypass restrictions, or assume an unofficial key grants access to official streaming. Keep manual entries independent of this provider.

### Кинопоиск selection and failure handling

Search results are candidates. Display enough supplied metadata (title, year, type) to let the user select; never save the first match automatically when names are ambiguous. Fetch details for the selected provider ID, then let the user confirm/edit values. Movie/episodic/anime mapping, uncertain runtime units, and incomplete records require confirmation rather than guessed data.

The contract documents 400 invalid parameters, 401 token failure, 402 request allowance exhausted, 403 account restriction, 404 missing film, 429 rate limiting, and 500 server errors. These must all preserve manual entry. Some statuses have no documented JSON body: classify by HTTP status even for empty or non-JSON responses. Search may return zero candidates. [OpenAPI responses](https://kinopoiskapiunofficial.tech/documentation/api/openapi.json)

## Field matrix and mapping boundaries

The mappings below are recommendations for the normalized contract in [#16](https://github.com/xiaodlb/watchnext/issues/16). They do not approve unresolved product decisions in [decisions.md](decisions.md).

| App field | YouTube v3 | Kinopoisk API Unofficial v2.2 |
| --- | --- | --- |
| Provider identity | `id`, in a YouTube-specific namespace | `kinopoiskId`, in this exact service's namespace; do not equate other providers' IDs |
| Title | `snippet.title` | First nonblank `nameRu`, `nameOriginal`, `nameEn`; otherwise ask user |
| Content type | WatchNext YouTube video | `FILM` → candidate Movie; `TV_SERIES`/`MINI_SERIES` → candidate Series; other values require selection. Anime is not a dedicated type enum; do not infer it automatically. |
| Full/typical duration | `contentDetails.duration`, ISO 8601; e.g. `PT24M` → 1440 seconds for a video | `filmLength` is nullable integer; the inspected schema does not explicitly define units or guarantee episodic semantics. Treat minutes as an **unverified interpretation**, requiring confirmation before conversion. Never use it as confirmed typical episode length. |
| Genre | `snippet.categoryId` is not a WatchNext genre list; genre mapping unsupported in this route | Optional `genres[].genre` labels; empty remains empty |
| Mood | Unsupported; user chooses | Unsupported; user chooses |
| Cover | Available `snippet.thumbnails` URL, no assumed fixed resolution | `posterUrl`/preview URL if supplied; permission to display/cache still unverified |
| Source link | Construct canonical YouTube watch URL from validated ID | `webUrl`, a metadata page |
| Watch link | Canonical YouTube URL; runtime access may still be restricted | No guaranteed playable or episode-specific link. Keep source and user-entered watch link distinct. |

Source contracts: [YouTube resource fields](https://developers.google.com/youtube/v3/docs/videos) and [Kinopoisk OpenAPI schemas](https://kinopoiskapiunofficial.tech/documentation/api/openapi.json). App-owned feedback, contributors, and progress never come from either provider. Neither provider supplies the agreed fixed mood tags.

## Synthetic response shapes and transformations

**Synthetic YouTube success, relevant-field projection only:**

```json
{
  "items": [{
    "id": "REDACTED_ID",
    "snippet": {
      "title": "Example comedy video",
      "liveBroadcastContent": "none",
      "thumbnails": {"default": {"url": "https://example.invalid/cover.jpg"}}
    },
    "contentDetails": {"duration": "PT24M"},
    "status": {"privacyStatus": "public"}
  }]
}
```

Map to YouTube namespace + ID, title, video type and 1440-second full duration; derive its canonical YouTube watch URL from the validated ID. Leave genres/moods for user input. Thumbnail is optional; this reserved example is not a real image. The illustration is consistent with the delivered D17 whole-second contract.

**Synthetic YouTube failures:**

```json
{"items": []}
```

Maps to unavailable metadata, not proof that the video was deleted.

```json
{"error": {"code": 403, "message": "REDACTED", "errors": [{"reason": "quotaExceeded"}]}}
```

Maps to quota unavailable with manual fallback. An unsupported duration such as an absent value is a validation failure even in an otherwise successful response; retain the known title and request manual runtime.

**Synthetic Кинопоиск search, reduced response:**

```json
{
  "total": 2,
  "totalPages": 1,
  "items": [
    {"kinopoiskId": 1001, "nameRu": "Example title", "year": 2001, "type": "FILM"},
    {"kinopoiskId": 1002, "nameRu": "Example title", "year": 2021, "type": "TV_SERIES"}
  ]
}
```

Maps to two selectable candidates, not a saved entry. Numbers and titles are invented. User selection of 1002 triggers a detail lookup for that candidate only.

**Synthetic Кинопоиск detail, relevant-field projection only:**

```json
{
  "kinopoiskId": 1002,
  "nameRu": "Example title",
  "nameOriginal": null,
  "type": "TV_SERIES",
  "filmLength": null,
  "genres": [{"genre": "comedy"}],
  "posterUrl": "https://example.invalid/poster.jpg",
  "webUrl": "https://www.kinopoisk.ru/series/1002/"
}
```

Maps to a Series candidate with a comedy genre label and metadata source URL. Ask for typical episode duration, mood tags, numbering style, and an optional actual viewing link; never fill missing runtime with 22 minutes. Missing title/invalid ID makes the import incomplete, not a license to invent metadata.

**Synthetic Кинопоиск failure:**

```json
{"message": "REDACTED_PROVIDER_ERROR"}
```

This body follows the documented `ApiError` shape, but does not by itself determine failure class. Pair it with HTTP status, for example 403 → unavailable account, while 401/402/404/429 may have an empty body. Show a safe message and preserve manual input.

## Follow-up verification and ownership

- [#16](https://github.com/xiaodlb/watchnext/issues/16): normalized result/error contract, provider namespaces, incomplete-field handling, and synthetic fixtures; distinguish source URLs from playable links and imported data from user-authored history.
- [#17](https://github.com/xiaodlb/watchnext/issues/17): YouTube key configuration and authenticated smoke test, ID parsing, private/deleted/live/malformed cases, quota errors, branding, and imported-metadata retention/refresh behavior.
- [#18](https://github.com/xiaodlb/watchnext/issues/18): verify the actual unofficial account's access/price/allowance, search/detail behavior, runtime units, episodic duration gaps, and permitted cover use. If verification fails, report unavailable without scraping or purchasing access.
- [#19](https://github.com/xiaodlb/watchnext/issues/19): candidate selection, explicit correction of uncertain fields, safe failure messaging, and manual fallback even when both providers are unconfigured.

No source is labeled verified usable without an authenticated result. These outstanding checks belong to the linked provider/interface/UI tasks and do not prevent completing this research document. U01 in the decision record should be revisited with these findings during an authorized decisions update; this task does not mark product proposals approved.

## Implemented offline contract

See [metadata-contract.md](metadata-contract.md) for the #16 normalized projections, safe failures, synthetic fixture coverage and review/persistence handoff. These tests verify interface behavior only; actual provider availability, runtime semantics and rights remain unverified until the corresponding adapter work. No provider becomes authenticated or usable because a synthetic fixture passes.

The [#18 Unofficial adapter](kinopoisk-adapter.md) records the October 16 OpenAPI 2.0.1 recheck and implemented search/detail transport with synthetic tests. Endpoint/header/status contracts follow public documentation. Runtime units, account allowances and external cover/persistence rights remain unverified. Runtime stays manual and covers absent. Delivered [#19 lifecycle](metadata-lifecycle.md) records the delegated local academic text-snapshot policy with a real app-chosen 30-day refresh/delete deadline; uncertainty is not an invented permanent save ban or verified-license claim.
