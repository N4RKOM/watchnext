# Account and discovery enhancement

Date: October 18, 2026. Status: **authorized for sequential implementation; delivery tracked by live issues**.

The initial clarification/issues-only phase is complete. The user then explicitly said “выполни оставшиеся ишшюс на гитхабе” (implement the remaining GitHub issues), authorizing #31–#40 through sequential PM → Engineer → independent QA. This supersedes the planning pause and earlier planning-only issue comments/constraints. Each issue is refreshed before implementation and closed only after fresh QA PASS. Original #1–#30 remain the completed legacy release. Authorization does not imply any enhancement is already delivered and does not permit interrupting the user's server or migrating normal data for verification.

This document supersedes first-release no-account restrictions **for the planned new authenticated mode only**. Current legacy behavior and the dated first-release completion audit remain historical/current-release evidence, not claims that this enhancement already works.

## Explicit user choices

| Choice | Required behavior | Owning issues |
| --- | --- | --- |
| 1 | Real username/password registration and sign-in | [#31](https://github.com/xiaodlb/watchnext/issues/31), [#32](https://github.com/xiaodlb/watchnext/issues/32) |
| 2 | Account can create a group or join via invite | [#34](https://github.com/xiaodlb/watchnext/issues/34) |
| 3 | One account has multiple groups and switches between them | [#34](https://github.com/xiaodlb/watchnext/issues/34) |
| 4 | Existing legacy groups stay separate; account groups start fresh. No profile claiming, migration, history reassignment or name matching | [#31](https://github.com/xiaodlb/watchnext/issues/31), [#34](https://github.com/xiaodlb/watchnext/issues/34) |
| 5 | Provider-available supported fields autofill; mood is manual | [#37](https://github.com/xiaodlb/watchnext/issues/37), [#38](https://github.com/xiaodlb/watchnext/issues/38) |
| 6 | YouTube title and link lookup; choices show thumbnail, channel and duration | [#36](https://github.com/xiaodlb/watchnext/issues/36), [#38](https://github.com/xiaodlb/watchnext/issues/38) |
| 7 | Missing runtime requires manual completion before save | [#38](https://github.com/xiaodlb/watchnext/issues/38) |
| 8 | One shared deduplicated list, Added by me filter, all adders visible | [#39](https://github.com/xiaodlb/watchnext/issues/39) |
| 9 | Only contributors edit shared metadata | [#34](https://github.com/xiaodlb/watchnext/issues/34), [#38](https://github.com/xiaodlb/watchnext/issues/38) |
| 10 | Creator removes participants and rotates invite; preserve removed participants' titles/history | [#35](https://github.com/xiaodlb/watchnext/issues/35) |
| 11 | Private recovery code at registration resets forgotten password without email | [#32](https://github.com/xiaodlb/watchnext/issues/32), [#33](https://github.com/xiaodlb/watchnext/issues/33) |
| 12 | Covers/previews in search, shared list and detail | [#37](https://github.com/xiaodlb/watchnext/issues/37), [#38](https://github.com/xiaodlb/watchnext/issues/38) |

Selecting a Kinopoisk film or YouTube video must populate all supported available fields without a second Apply proposal action. Candidate choice does not save automatically. User can correct metadata before save; review identity remains server-owned. Missing/uncertain fields stay visibly missing, never guessed.

## Reasoned engineering defaults — not individual user answers

These are bounded project-fit choices under existing delegated authority. They may be refined by an implementation issue with documented rationale, without inventing new user approvals.

- Use Node24 native asynchronous scrypt with random per-password salt, versioned parameters and constant-time comparison; choose/document a current OWASP-appropriate work factor and memory budget. Password input is 12–128 Unicode code points, preserved exactly without trim/normalization. No composition checklist.
- Username is 3–32 ASCII letters, digits, underscore, dot or hyphen; trim surrounding whitespace, enforce case-insensitive uniqueness, retain display case. Profile display/color may follow existing group conventions; account identity cannot be replaced by a display-name selector.
- Recovery code is at least 32 cryptographically random bytes, encoded for copying; store only a digest. Issue once at registration, replace once on successful recovery. A code resets only its named account and revokes all its sessions. Missing both password and code has no recovery backdoor.
- Opaque account sessions are hashed at rest and separate from legacy cookies. Use HttpOnly, SameSite=Lax, Path=/, Secure on HTTPS; browser-session cookie with seven-day absolute server expiry. Login rotates the current credential. Logout revokes current session; recovery revokes all account sessions. Guard mutation origin and method.
- Bound signup/login/recovery work and failed attempts. A reasonable initial default is five failed attempts per account-key/request-source window of 15 minutes, with bounded expiring storage; document process-restart/local deployment limitations rather than claiming distributed protection. Generic login/recovery errors avoid unnecessary account disclosure.
- Live account membership authorizes each account-group request. Switching groups invalidates stale review/picker context; viewers are chosen participants, not identities allowed for own writes.
- Creator cannot remove themselves. Removing membership retains its stable historical member identity and every title, contribution, progress, rating and note, even if they were the only contributor. Historical attribution may be shown as inactive. Inactive members cannot be selected as new viewers or obtain current access.
- Removed account cannot rejoin through an invite generation issued at/before removal. A newer explicitly shared rotated invite can reactivate the same membership/member history. No second profile or history reassignment. Existing members retain access on rotation; owner does not gain contributor editing rights merely by owning the group.
- YouTube explicit search page defaults to ten video candidates, enriched in one bounded batch for duration/channel/thumbnail; no keystroke search/crawl. Opaque pagination stays query/account/group bound. Kinopoisk uses its supported bounded pages. Current quota and timeout specifics must be documented in provider tasks.
- Remote provider-published HTTPS images are displayed with validated hosts, no-referrer and fallback, without binary download/cache. Posters use 2:3; videos use 16:9. Do not invent a poster, playable film URL, runtime, genre or mood.
- All titles is the shared-list default; Added by me is a view over the current account membership's contribution, not a second list. It does not alter picker scope/ranking.
- No email/SMS/social auth, paid services, scraping, embedded playback, group ownership transfer, account/group deletion or legacy conversion is added in this enhancement.

## Delivery order and boundaries

### Issue #32 technical defaults and handoff

Refreshed after #31 QA PASS on October 18, 2026; these are engineering defaults, not additional user answers. Use the existing 0004 account fields without rewriting applied SQL. Native async scrypt version 1 uses N=131072, r=8, p=1, 64 output bytes, a new random 16-byte salt and maxmem=256 MiB. Validate stored parameter versions before invocation; malformed/untrusted parameters must not cause unbounded work. Compare fixed-size digests with timingSafeEqual; unknown usernames perform equivalent dummy password work before the same generic login error. Do not claim whole-request constant timing. Bound simultaneous expensive jobs (default two) and waiting jobs (default eight), returning a safe busy/retry state when full. Apply five failed-login attempts per normalized username per 15-minute window, with bounded expiring entries; signup needs bounded admission/attempt protection too. Request-source limits may only use a genuinely trusted source, not arbitrary forwarded headers. Document process-local/restart limitations and test expiry through controlled time rather than prolonged sleeps.

Account registration/login/logout live at /register, /login and /account with protected POST actions. Registration may establish its own fresh account session and display its private recovery code once; existing account sessions/legacy cookies are never silently converted to another identity. Use 32-byte random base64url credentials with SHA-256 hashes at rest, a separate watchnext_account_session cookie, browser-session cookie lifetime and seven-day absolute server expiry. Current-token replacement must revoke the prior account token only on successful transaction; expiry/revocation/tampering fails closed. Logout clears/revokes only the account cookie/session and leaves unrelated legacy access alone. Sensitive responses are dynamic/private and do not persist raw password/code/token in URL, logs, local/session storage or retained browser-test artifacts. Login cannot redisplay a recovery code. The one-off code view needs explicit save/copy guidance and a Continue action; never echo passwords back on validation failure.

Signed-out landing exposes real Register/Sign in and separately labeled existing legacy group access. /account shows only the actual signed-in username, Sign out and honest group-feature availability until #34; no dead create/join or forgot-password control before its owning issue. Direct anonymous account access redirects safely; redirect destinations, if accepted, must be same-origin relative allowlisted paths. Recovery reset/rotation belongs to #33, group membership consumers to #34. Use the existing palette/keyboard conventions at 375px and 1280px.

Primary references rechecked October 18: [Node24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). The chosen work factor follows a published scrypt profile; maxmem intentionally exceeds Node's approximate work-memory requirement. Native APIs fit the current schema and avoid a new dependency. This does not claim MFA, distributed throttling, hosted security certification or new product scope.

Each issue uses the four-section template. The newly authorized backlog run follows the order below; later issues consume the named contracts. Live issue state and fresh QA evidence determine delivery, not this index.

| Order | Issue | Prerequisites |
| --- | --- | --- |
| 1 | [#31 Account/membership storage](https://github.com/xiaodlb/watchnext/issues/31) | Completed legacy baseline |
| 2 | [#32 Registration/login/logout/session](https://github.com/xiaodlb/watchnext/issues/32) | #31 |
| 3 | [#33 Recovery](https://github.com/xiaodlb/watchnext/issues/33) | #32 |
| 4 | [#34 Account groups and ownership guards](https://github.com/xiaodlb/watchnext/issues/34) | #32, #33 |
| 5 | [#35 Owner removal/invite rotation](https://github.com/xiaodlb/watchnext/issues/35) | #34 |
| 6 | [#36 YouTube title/link candidate contract](https://github.com/xiaodlb/watchnext/issues/36) | #34 |
| 7 | [#37 Kinopoisk posters/available fields](https://github.com/xiaodlb/watchnext/issues/37) | #36 compatible candidate contract |
| 8 | [#38 Autofill/review/previews integration](https://github.com/xiaodlb/watchnext/issues/38) | #34, #36, #37 |
| 9 | [#39 Added by me/attribution](https://github.com/xiaodlb/watchnext/issues/39) | #34, #38 |
| 10 | [#40 Authenticated journeys/docs audit](https://github.com/xiaodlb/watchnext/issues/40) | #31–#39 |

#31 adds schema only; #32–#33 establish credentials without claiming complete group access; #34 integrates live ownership across existing consumers. #35 supplies removal/rotation controls. Provider adapters land before UI claims. #38 reuses the existing trusted review, contribution merge/confirmation, archive restore and provenance lifecycle; it does not replace them. #40 verifies all twelve choices and legacy regression.

Applied migrations remain immutable. An additive schema change classifies all existing groups legacy and preserves business values/IDs; only newly created authenticated groups use account membership. Tests initialize only disposable databases. No task claims to migrate a user's normal database as part of verification.

## Account storage contract — issue #31

The additive foundation is documented in [database.md](database.md#additive-account-foundation--issue-31). Under the existing delegated authority, #31 chooses explicit immutable group mode/owner columns rather than copying groups or reassigning profiles; memberships map one account/group to one stable member, preserving historical attribution across removal/rejoin. Session timestamps use UTC Unix seconds, with no cookie or runtime access implementation in this issue. Hex digests/salt and explicit versioned scrypt parameter columns permit #32 to implement native hashing without raw-credential schema defaults; the SQL parameter ranges are storage bounds, not an implemented work factor.

Invite generation starts at 1; removal records the generation that bars old invitations, and reactivation requires a newer generation on the same membership. Group generations cannot decrease. SQL rejects cross-mode legacy sessions/account memberships and wrong-group member mappings. Actual token issuance, membership authorization, rotation and viewer filtering stay #34/#35. Existing groups remain legacy; no account creation, name matching, history claiming or conversion occurs during migration. These are reasoned implementation choices under delegated authority, not additional explicit user answers.

## Account credential implementation contract — issue #32

See [the actual API/security contract](api.md#account-registration-login-and-logout--issue-32). #32 uses the groomed exact scrypt defaults with native asynchronous work, a process-shared 2-active/8-waiting pool, 30-second queue deadline, bounded 15-minute attempt maps, one-time registration recovery reveal and separate seven-day hashed account sessions. Additional bounded delegated choices are a 4096-byte/ten-second JSON body limit, 2048-key throttle capacity, signup total admission of thirty attempts per window, fixed local navigation targets and clearing secret fields/recovery state on departure. These suit the local academic deployment and preserve legacy entry; they are not additional individual user answers or distributed-security claims. Reset remains #33 and live account-group authority #34; no password or code can claim an old profile.

## Recovery defaults for issue #33

After #32 QA PASS, #33 adds /recover linked from /login and protected JSON POST /api/account/recover, reusing current bounded body/origin handling, password validation, native scrypt parameters and shared work pool. Username plus the exact saved 32-byte base64url code authorizes reset; no account/group cookie or supplied member/account ID grants recovery. Compare fixed-size digests safely, using a dummy expected digest for unknown accounts; invalid/missing/malformed/used codes share generic failure. New-password validation errors may be specific without confirming an account. Codes are offline recovery material and remain valid until successful use/replacement; no arbitrary expiry is imposed on a code the user saved at signup. This is a delegated engineering default consistent with the explicit no-email recovery requirement, not another user answer.

Use a separate bounded five-attempt/username/15-minute recovery counter and thirty-attempt total admission window, expiring bounded keys like #32; do not permanently lock login or change credentials on failed proof. Derive a fresh password salt/hash outside the SQL transaction, then transactionally recheck/conditionally consume the same current recovery digest, replace password parameters/hash/salt and recovery digest, and revoke every target-account session. Concurrent use has one winner; stale login work must fail if its captured password changed. Generate a new random 32-byte code, persist only its hash, reveal only on committed success, then require ordinary login without issuing a recovery session. Rollback retains old password/code/sessions. A lost success response cannot retrieve the replacement code; UI must explain to save the displayed code and re-enter secrets for deliberate retries, without leaking input.

Successful reset clears the current browser account cookie for a fresh sign-in, but revokes only the recovered account's server sessions; unrelated accounts and the legacy cookie remain intact. Duplicate/tampered cookies never select the target account or grant reset proof. Replacement-code UI follows #32 private save/copy/clear-on-departure behavior, with Continue to /login. Do not put secrets in browser storage, URLs or retained test artifacts. Lost password plus lost code has no support/legacy-profile backdoor. Primary guidance rechecked October 18: [OWASP forgot password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), including its offline-method lifetime distinction, single-use codes, normal login afterward and session invalidation. No email channel or live security certification is claimed.

The #33 implementation follows [the recovery API contract](api.md#private-offline-code-recovery--issue-33): no cookie-selected target, fixed-size proof comparison, digest-CAS reset/revoke-all, separate bounded attempt state and fresh login afterward. Malformed names share a bounded invalid-name admission bucket; invalid proof uses cheap digest work, with native password derivation only after valid proof. This is a reasoned bounded implementation choice, not an additional user answer. Real tests hold old-login work across reset, race two consumers and force revocation failure; no schema or business-history change is needed.

## Provider evidence and limits

Primary material inspected October 18, 2026:

- [YouTube search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list) documents official title search, video restriction and page tokens. The currently inspected page describes a separate Search Queries bucket (100 calls/day and 1 unit); do not copy historical 100-unit-per-search claims without checking the current documentation. Actual project entitlement/console configuration may differ; no live-key verification occurred.
- [YouTube videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos) supplies snippet thumbnails/channel title and contentDetails duration. Search snippets alone are not a duration source. Batched detail enrichment must match requested IDs. Live/unavailable durations require manual completion. Existing imported-field provenance and applicable 30-day refresh/delete deadlines remain mandatory, including thumbnail/channel data if retained; no stale copies in history/review/cache.
- [Kinopoisk Unofficial documentation](https://kinopoiskapiunofficial.tech/documentation/api/) and [its OpenAPI schema](https://kinopoiskapiunofficial.tech/documentation/api/openapi.json) publish posterUrl/posterUrlPreview and filmLength, plus title/year/type/genres. This is a third-party provider namespace, not an official Kinopoisk API. The inspected schema's numeric filmLength example does not itself specify units. #37 must record supported movie runtime evidence/convention before treating a value as minutes; genuinely uncertain/episodic runtime stays manual. This is not permission to permanently discard every available movie runtime.
- Provider-published poster examples use kinopoiskapiunofficial.tech image paths; other published image/CDN hosts must be checked before allowlisting. Do not accept arbitrary credential-bearing/protocol-relative/private-network image URLs. No blanket persistence/display ban was established by this inspection; enable the requested local academic previews while documenting actual restrictions/unknowns truthfully. Do not claim copyright ownership or verified licensing.
- [Node24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) and [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) support the selected native password-hashing approach; implementation records exact parameters and resource limits.

Provider keys remain optional for manual operation, server-only and never inspected/purchased for this planning phase. Synthetic mocks verify supported behavior, not live access. Missing-key/quota/timeout/error states preserve manual entry. Automatic fields are only those the provider genuinely supplies and the normalized contract supports; absent ratings/descriptions/episode counts do not become fabricated values.

## Planned interaction and server contracts

- Signed-out account landing offers Register/Sign in and separately labeled legacy access. Signed-in account home shows its groups/create/join/switch; no arbitrary legacy profile claim.
- Account-group own writes derive account/member server-side. Existing member-selection actions cannot impersonate members in account groups. Reads, lookup reviews, picker cycles, metadata refresh and mutations recheck current access, not just cookie existence.
- Recovery form submits secrets only in protected body; replacement code/private invitation reveal appears only in the explicit success view. Routine URL/request/error logs, traces and retained test artifacts must not capture credentials.
- Title/link lookup → explicit candidate choice when multiple results → automatically populated editable review → manual mood/missing-field completion → explicit Save. Stale lookup responses cannot overwrite current edits.
- Search cards show thumbnail/poster plus title and channel/duration or year/type. Review/list/details reuse safe preview fallback; images are optional, mood/runtime validation is not.
- Removed participants lose access immediately on subsequent requests but historical names/colors remain visible. A removed account retains its unrelated memberships.
- All/Mine filtering preserves shared metadata, one-entry duplicate semantics, all contributor attribution and own progress/feedback boundaries.

## Future verification and preservation

Implementation is now authorized but this PM authorization update changes documentation only. Each implementation must use temporary DBs and isolated production-browser fixtures with outbound-provider mocks; no keys, purchases, live API dependency, normal-data initialization or hidden test bypasses. Verify 375px/1280px keyboard flows, direct forged/stale/revoked access, races/rollback, restart/backup state and legacy-value preservation.

Do not stop/restart the user's running development server, revert their existing next-env.d.ts, or write the same .next output while it is active. Use a separate owned checkout/build output and serial resource-bounded runs. Current Next build uses a two-worker CPU cap; Vitest does not have a configured automatic worker cap. Optional explicit test concurrency under resource pressure must not skip/weaken tests.

The future #40 audit must name actual commands/results and map all twelve explicit requirements. The old completion audit covers only the legacy release. Earlier planning comments are historical; later PM/Engineer/QA comments record the authorized run without implying completion before verification.
