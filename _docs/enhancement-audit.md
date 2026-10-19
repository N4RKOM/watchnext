# Account and discovery requirement audit

Dated **October 19, 2026**. This maps all twelve explicit [user answers](account-discovery-enhancement.md) and issues #31-#40. The [October 18 legacy audit](completion-audit.md) remains an unchanged dated evidence record, including its historical #1 QA limitation. #31-#39 were independently QA-accepted before #40; **#40 remains open for fresh independent QA**, not an Engineer-issued PASS.

## Direct observable answer coverage

All browser modules below are mandatory in ordinary `pnpm test:e2e`, serially after a fresh current-source build, at **375px and 1280px**. Native app routes/actions, guards, adapters, normalized reviews, SQLite writes and sessions are real. Only outbound provider HTTP/image responses are synthetic. Read-only snapshots supplement screen assertions; SQL fixture writes simulate deadlines, read errors and legacy schema data, never implement the expected user journey outcome.

| Answer | Owning issue and current source | Observable verification |
| --- | --- | --- |
| 1 Username/password account | #31/#32; `db/migrations/0004_accounts_memberships.sql`, `lib/accounts/` | [Account UI journey](../tests/fixtures/accounts-browser-check.mjs): real signup, once-only private code, exact login, logout/rotation/expiry/restart; [native crypto/security](../tests/accounts/security.test.ts). |
| 2 Create/join account groups | #34; `lib/accounts/groups.ts` | [Group journey](../tests/fixtures/account-groups-browser-check.mjs): signed-out invite resumes registration and explicit Join; stable account-owned member, no arbitrary profile selector. |
| 3 Multiple groups | #34; `app/account/` and account-session selected context | Same group journey: three accounts, two groups, independent browser selection, switch-away/back stale-action rejection and foreign-ID denial. |
| 4 Keep legacy separate | #31/#34; additive migrations and access-mode guards | [Populated old-to-current upgrade](../tests/e2e/legacy-upgrade.mjs) preserves every original column/ID/ledger with no account claims; legacy whole UI journey and explicit separate-mode name selection remain. |
| 5 Available-field automatic editable review; manual mood | #37/#38; `app/watchlist/add/title-form.tsx` | [Autofill journey](../tests/fixtures/autofill-browser-check.mjs): clean selection populates without Apply; dirty replacement confirm/cancel, edits-during-await and late-response rejection; explicit mood/Save. |
| 6 YouTube title/link and context | #36/#38; `lib/metadata/youtube-transport.ts` | Same journey: both paths, actual channel/runtime/thumbnails, server-bound next/previous page handles and bounded visits; [discovery contract tests](../tests/metadata/youtube-discovery.test.ts). |
| 7 Missing runtime manual | #38 | Unknown/live YouTube and episodic Kinopoisk cannot save until genuine runtime/numbering completion; no inferred anime or guessed episodes. [Review tests](../tests/metadata/reviews.test.ts). |
| 8 Shared dedup, Added by me, all adders | #39; `lib/watchlist-filter.ts`, `lib/watchlist.ts` | [Mine journey](../tests/fixtures/watchlist-mine-browser-check.mjs): exact one joint card/all names/colors, server-current identity, own removal/final archive/same-ID restore, reload/back/forged/duplicate/expired denial; [saved-data query tests](../tests/accounts/watchlist-mine.test.ts). |
| 9 Contributor-only editing | #34/#38 | Group journey: owner cannot edit another's title, duplicate confirmation adds own contribution, edit works; rejected consumer requests preserve data. [Guard tests](../tests/accounts/consumers.test.ts). |
| 10 Creator removal/invite rotation/history | #35; `lib/accounts/management.ts` | Group journey: cancel/confirm, private once-only new invite, old/pending link denial, held provider result denied after removal, inactive attribution, retained sole/joint titles, stable-member newer-generation rejoin and old second-browser replay still denied. [Concurrency tests](../tests/accounts/management-concurrency.test.ts). |
| 11 Private no-email recovery | #32/#33 | [Recovery journey](../tests/fixtures/recovery-browser-check.mjs): wrong/unknown/consumed proof, exact replacement once, all target sessions revoked, other account/legacy unchanged, fresh login/restart. Group journey also recovers the very owner whose groups/history were just populated. [CAS/race tests](../tests/accounts/recovery.test.ts). |
| 12 Search/shared/detail covers | #37/#38 | Autofill and Mine journeys: actual allowlisted image URLs across search/review/list/detail/archive, broken/unsafe fallback, aspect/no-referrer/keyboard/overflow checks and expiry versus user-authored correction. [Image tests](../tests/watchlist-view.test.tsx). |

Personal timestamp/episode/completion, rating and note independence are checked in the group journey; legacy journeys retain full-duration ranking, selected-viewer catch-up/rewatch, explicit fallback and no-early-repeat/exhaustion/restart checks. Mine snapshots prove no feedback/progress/provider/picker writes. No requirement is replaced by a documentation-only limitation.

## Issue-to-evidence map

| Issue | Delivered scope / authoritative evidence |
| --- | --- |
| #31 | Additive account/hash/session/recovery/membership schema, preserved legacy business values. `tests/db/accounts.test.ts`, populated current-upgrade E2E fixture. |
| #32 | Real signup/login/logout, bounded full-cost native scrypt and one-time private code. `tests/accounts/service.test.ts`, `security.test.ts`, `http.test.ts`, account browser suite. |
| #33 | Proof-based recovery, digest CAS, revoke-all and private rotated code. `tests/accounts/recovery.test.ts`, recovery and populated-group suites. |
| #34 | All-group integration/live context membership epoch, no impersonation or stale request revival. `tests/accounts/groups.test.ts`, `consumers.test.ts`, group/browser/direct probes. |
| #35 | Real creator controls, generation-safe rejoin, preserved inactive history. `tests/accounts/management.test.ts`, concurrency/panel tests and group UI. |
| #36 | Official YouTube title/link, batched detail enrichment, bounded protected pages. YouTube discovery/review tests and real mocked-outbound UI. |
| #37 | Third-party Kinopoisk safe candidates/posters/selected detail, editable FILM minute interpretation. Kinopoisk discovery/review tests and same production UI. |
| #38 | Both-provider automatic editable review, manual missing gates, previews, provenance/expiry/context protection. Autofill browser suite and `tests/title-form.test.tsx`. |
| #39 | All/Mine with actual contribution, complete attribution/history/context behavior. Saved-query and Mine browser tests. |
| #40 | Mandatory supported runner, connected recovery/storage, populated legacy upgrade, fresh-checkout account/legacy walkthrough and this reconciliation. Engineer verification below; fresh independent QA required. |

## Verification revisions and commands

Baseline #39: `d4dbe742886199bac4409b78b3a5cddc4e53c531`. #40 runner/storage foundation: `ab18191`. A first full extraction run passed every functional suite but failed a duplicate final audit of an already-cleaned fixture. The redundant post-cleanup read was removed; per-suite pre-cleanup audit and cleanup audit remain mandatory. The subsequent ordinary consolidated command passed all suites, including the new populated legacy upgrade and authenticated WAL restore.

Final clean committed source, ordinary whole suite/type/build/storage, repeated full supported E2E, deliberate private-registration failure cleanup and fresh-checkout results are recorded after execution below. Until those entries are recorded, this section is an implementation-progress record, not a claim that unexecuted checks passed.

## Storage and privacy evidence

[Authenticated storage helper](../tests/e2e/account-storage.mjs) uses UI-created real password hashes/recovery digests, owners/memberships/removal, account-session expiry/revocation/context, invite generations, histories and provenance. It compares **all logical tables** through committed WAL to a new backup and separate restore plus a fresh Node process. Snapshot deadlines do not change. Real offline maintenance on the restored file clears a due pending review and imported runtime/cover, preserves the user-corrected title and personal/security rows, then real browser access succeeds for the owner and fails for the removed participant. Source main/WAL and neighbouring normal/demo/unrelated sentinels remain unchanged. [Recipe and snapshot-time security rollback limits](backup-restore.md).

Each suite captures private generated password/recovery/invite/session/review/provider values in memory, scans captured logs, generated build artifacts and fixture files, and removes owned browser/server/database/sentinels. No private screenshot/HAR/video/storage-state/trace is retained. Signal interruption targets the active owned fixture. No normal user storage is initialized, backed up or migrated. The user's M-drive dev server, next-env and build output are untouched.

## Honest limits

- Recorded execution is Windows Node24/pnpm11.25/pinned Chromium, not hosted Linux CI or public deployment/security certification. Linux instructions are portable setup guidance, not claimed execution.
- Providers use synthetic outbound contracts. No real keys inspected, live entitlement/quota/image licensing verified or purchase performed. Manual operation remains key-free. YouTube deadlines and app-chosen Kinopoisk local30-day policy remain enforced.
- Kinopoisk FILM filmLength minutes are an **editable app interpretation**, not units confirmed by the inspected OpenAPI; episodic/unknown/invalid runtime remains manual. Mood is always manual; no fabricated duration/episode count/anime inference.
- Backups capture security state at snapshot time. Later reset/revocation/removal cannot be reconstructed from an older copy. No automatic global logout/lost-code recovery is promised. Offline expiry requires deliberately maintaining/deleting retained copies; no powered-off erasure or SSD/cloud snapshot cleanup is claimed.
- Existing bounded Next migration tracing warning remains. Build and Vitest concurrent-worker caps are two; test discovery/assertions/default timeouts/native crypto remain unchanged. PM authorized the bounded #40 concurrency repair after a reproducible 957pass/1timeout versus958pass controlled comparison. No dependencies/schema/product behavior were changed for #40.
- Email/social login, legacy claiming/conversion, ownership transfer, hard deletion, hosting, playback and preference learning remain outside the explicit scope. The existing synthetic demo intentionally remains legacy mode.
