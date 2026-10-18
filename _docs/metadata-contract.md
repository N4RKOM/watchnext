# Normalized metadata contract (#16)

This is the pure offline layer of the delivered provider integration. `types.ts` defines projections/results and `lookupMetadata` accepts an injected provider; implemented #17/#18 adapters own credentials/fixed-host transport, and #19 owns review/save/lifecycle. Those operations are deliberately outside this pure module. See [the delivered lifecycle](metadata-lifecycle.md) and [research](metadata-providers.md) for honest live-access/rights/runtime limits.

## Delegated interface choices

Adopted October 16, 2026 under the October 15 autonomy directive quoted in [plan.md](plan.md), not separate explicit user approvals. Built-in TypeScript/URL/Date and existing Vitest suffice; no dependencies added. Adapter-neutral projections and one validation boundary keep provider payloads out of later forms. Strict identity and runtime checks preserve the existing save bounds without teaching the generic shared-save service provider-specific response formats.

Namespaces are exactly `youtube` and `kinopoisk_unofficial`; the second names a third-party service, not an official Кинопоиск API. YouTube detail IDs are exactly 11 ASCII letters/digits/underscore/hyphen. Unofficial IDs are canonical positive decimal strings of 1–19 digits, without leading zeros. Adapters must preserve IDs losslessly; no numeric coercion, URL parsing or alias normalization occurs here. Invalid query IDs do not reach the adapter. Invalid returned identities cannot become selectable. A detail response for a different ID is rejected. Providers return projections with unknown-valued fields, not their raw payloads.

`LookupQuery` is either `{kind: "search", text}` (trimmed 1–200 Unicode characters, no control characters) or `{kind: "detail", externalId}`. Search results contain only identity, nullable title/year/type/cover. Multiple results remain multiple: selecting one means a later explicit detail query with that identity, never an automatic choice/save. Invalid identities are omitted with `omittedInvalidCandidates`; a nonempty response containing no valid identities is `invalid_metadata`, not a false no-match. Search uncertainty clears affected hints. A genuinely empty successful search returns `no_match` with manual fallback.

## Result and review semantics

| `kind` | Meaning |
| --- | --- |
| `available` | Required provider suggestions are valid; still requires review and moods |
| `incomplete` | Missing, uncertain, unsupported or invalid fields are recorded in `issues`; required manual fields are listed |
| `candidates` | Selectable search hints, not detailed metadata or save authorization |
| `no_match` | Empty successful search; manual entry remains available |
| `failure` | Stable safe code/message, recovery policy and manual fallback |

An item has canonical identity, nullable title/content type/year, `{seconds, meaning}` duration, optional genres and independent cover/source/watch URLs. Titles are trimmed 1–200 Unicode characters without controls. YouTube accepts `youtube`; Кинопоиск accepts normalized `movie`/`series`. Raw enums such as `FILM`, unsupported types and inferred anime are not accepted. The adapter must explicitly map supported source types; user review may later choose anime. Missing/uncertain required title/type/duration stays null and appears in `manualFields`. `uncertainFields` may name known fields; their suggestions are cleared rather than silently trusted.

Duration is accepted only when the adapter declares `verified: true`, a finite integer of 1–86400 seconds and the matching meaning. Movies/videos use `full_item`; episodic content uses `typical_episode`; unknown type uses `unknown` and null seconds. ISO duration parsing, provider-unit verification and episodic semantics belong to adapters #17/#18. Fractions, zero, infinity, missing values, unverified lengths and series totals passed as `full_item` become null with an issue. The contract never computes remaining runtime, rounds or supplies a default episode length. A truthful verified flag requires evidence from the adapter, not a form value.

Genres are optional labels, trimmed/case-deduplicated, at most 10 labels of 1–40 Unicode characters without controls. Invalid labels are removed with explicit issues; an over-limit list is cleared with an issue rather than silently truncated. URLs use the existing `safeExternalUrl` rules; credentials, controls, whitespace, backslashes and non-HTTP(S) schemes are rejected. The metadata boundary additionally rejects fragments and credential-like query keys (key/token/secret/auth/credential/password/signature). Removed supplied URLs are explicit issues. No URL or genre is invented. A metadata source URL is not a playable watch URL. Missing optional genres/cover/link alone does not cause incompleteness or block manual completion. Safe shape is not evidence of cover-display rights; #18 must verify rights before supplying a cover.

Every item requires `review_metadata` and `choose_moods`; episodic items also require `choose_numbering` and `confirm_typical_episode_duration`. Even `available` is **not a save-ready form**. Lookup does not assign moods, numbering, progress, completion, ratings or notes. Provider suggestions do not overwrite user corrections/history. Only allowlisted result fields are projected; raw payloads, headers, exceptions and arbitrary supplied provenance are discarded. Provider projections must contain public catalog data only; this interface does not make private/account data safe for publication.

## Safe failures and cancellation

| Code | Retry policy |
| --- | --- |
| `invalid_query`, `invalid_metadata` | `never` for the unchanged request; correct input or add manually |
| `not_found_or_inaccessible` | `user` (availability may change); add manually |
| `not_configured` | `after_configuration`; add manually meanwhile |
| `quota_exhausted` | `after_provider_reset`; no invented reset time |
| `rate_limited` | `after_delay`; optional validated integer 0–86400 `retryAfterSeconds` |
| `network_error`, `timeout`, `provider_error`, `cancelled` | `user`; retry explicitly or add manually |

All failures have `manualFallback: true` and fixed messages from the catalog in `lookup.ts`. No provider error text/request URL is returned or logged. Unknown exceptions/codes become generic `provider_error`; transport-specific classification is the adapter's responsibility. No automatic retry/network timeout is scheduled by this interface. The optional AbortSignal is passed to the adapter; already-aborted requests skip it, and cancelled completed requests discard the response. #17/#18 must honor cancellation and bound actual transport time.

## Provenance and freshness

Detailed items derive `acquiredFields` from accepted suggestions, with `origin: provider_suggestions`, provider namespace and retrieval time from an injectable trusted server clock. Adapters cannot supply arbitrary provenance timestamps. Invalid clock values fail safely. Year is a candidate/review hint, not a new persisted save field.

Public, non-authorized YouTube metadata carries `youtube_public_30_days`, a UTC retrieval-plus-30-calendar-days `refreshBy` and `refresh_or_delete` action, following the [YouTube developer policy](https://developers.google.com/youtube/terms/developer-policies) discussed in the research. This is a refresh/delete deadline, never a guarantee metadata stays correct for 30 days. Кинопоиск carries `provider_policy_unverified` and `verify_policy_before_persistence`, no invented forever-fresh date. There is no persistence/refresh enforcement in #16. #17/#18/#19 must resolve actual access/policy and implement the appropriate lifecycle before storing imported suggestions. User-authored corrections, moods and personal history remain separate from provider-acquired fields.

## Review-to-save handoff (#19)

1. A server adapter produces a normalized detailed item after explicit candidate selection where needed. Hold identity/provenance in server-owned state associated with the current review; arbitrary submitted namespace/ID fields never establish provider authority.
2. Show suggestions and incomplete/uncertain fields. The user supplies/corrects title, content type, finite full/typical duration, fixed moods, and episodic numbering. Optional fields can remain empty. Keep corrections distinguishable from imported suggestions.
3. Convert completed fields into existing `ManualTitleInput` (whole minutes/seconds, CSV genres, fixed moods and numbering) and validate with the existing title validator. This does not call the manual form action with provider fields; that action intentionally ignores them.
4. Only the trusted server path constructs the existing `SaveInput` provider variant for `saveTitle` in `lib/shared-save.ts`: reviewed `fields`, `{namespace, externalId, sourceUrl?, coverUrl?}` from the validated server-owned identity and reviewed safe links, plus an explicit confirmation ID when required. Recheck group/profile access and preserve shared-save confirmation, collision, contribution, archive restoration and history rules from #13/#15. Lookup itself never invokes this operation.

Review UI, server review state, shared-save provenance and policy enforcement are delivered in [#19](https://github.com/xiaodlb/watchnext/issues/19), consuming the implemented #17/#18 adapters. Authenticated live access remains unverified; the pure module itself performs no persistence/network calls.

## Verification

`tests/metadata/fixtures.ts` is explicitly **synthetic/documented-not-live-tested**: invented normalized YouTube detail, episodic Кинопоиск detail and ambiguous Кинопоиск search, not captured API responses or authenticated-access proof. Injected fake providers exercise all result categories and projection/validation boundaries without network, configuration, credentials or database requirements. Run `pnpm exec vitest run tests/metadata/lookup.test.ts --maxWorkers 2`.
## Integration update — issue #19

The interface above remains pure/offline, while the app now consumes delivered adapters through the [trusted review and lifecycle integration](metadata-lifecycle.md). A short-lived bound snapshot supplies original values/identity; actual shared-save provenance and refresh/deletion enforcement now exist outside this module. Genre labels containing commas cannot be represented by the existing CSV editor and are explicitly incomplete instead of silently becoming different genres.

`provider_policy_unverified` remains truthful adapter-stage Кинопоиск output. The authorized local academic text-snapshot policy adopted in #19 adds `academic_local_snapshot_30_days` at the server review/storage boundary, with an app-chosen refresh/delete deadline and disclosed external-rights/account uncertainty. Thus the provisional #16/#18 verify-before-persistence handoff is satisfied by a recorded project decision rather than an invented permanent save ban; image/streaming rights are not claimed and covers stay absent.
