# WatchNext — product and software specification

Version 1.0 · October 19, 2026 · English

This specification describes the completed application at baseline **441fcaae660e273d6fc373f8757be562d9139b78**, preserved by tag **graded-baseline-2026-10-19**. Issues 1–40 are closed; [final independent QA](https://github.com/xiaodlb/watchnext/issues/40#issuecomment-6263933927) accepted the current release. Earlier “awaiting QA” phrases in dated implementation records describe their writing time, not current issue status. The [graded MVP plan](graded-mvp.md) proposes an architectural delivery iteration; HTTP-wide repository abstraction and Prisma are **not current implementation claims**.

## 1. Purpose and requirement authority

WatchNext helps couples/friends choose from content they already wanted to watch. A private shared list holds movies, series, anime and YouTube videos. Users record progress and ask for one suitable item/episode using available time, selected viewers and mood.

The twelve explicit account/discovery choices require: username/password accounts; create/invite groups; multi-group switching; separate unchanged legacy groups; available-field autofill with manual mood; YouTube title/link lookup with thumbnail/channel/duration; manual missing runtime before save; shared deduplication/Mine/all adders; contributor-only metadata edits; creator removal/invite rotation with history preservation; private no-email recovery codes; previews in search/list/details.

The detailed bounds, deterministic ranking, password parameters and recovery/rejoin policies below are **engineering defaults adopted under delegated authority**, not additional individually answered questions. [Decisions](decisions.md) and [enhancement scope](account-discovery-enhancement.md) retain provenance.

## 2. Actors and permissions

An account identifies a person; a member is that account's stable identity **inside one group**. A contributor is a member who saved a particular title. Ownership and contribution are separate.

| Actor/context | Allowed operations | Restrictions |
| --- | --- | --- |
| Signed-out visitor | Register/login/recover; open invitation continuation | No account-group private data |
| Active account-group member | Read shared list/history; save/contribute; write own progress/feedback; pick | Cannot impersonate another member |
| Title contributor | Edit active shared metadata; remove own contribution | Cannot edit others' personal history |
| Group creator | Member operations plus remove participants/rotate invite | Cannot remove self or bypass contributor editing |
| Removed participant | Retains account/other memberships | Denied this group's reads/writes until valid rejoin |
| Legacy invitation holder | Select/create trusted named profiles and use legacy group | Name selection is not verified identity |

**FR01 — Accounts.** Registration/login use a trimmed, case-insensitively unique username of 3–32 ASCII letters/digits/underscore/dot/hyphen. Display case is retained. Passwords contain 12–128 Unicode code points, without silent trimming/normalization; registration confirms them.

**FR02 — Recovery/session.** Registration displays one private random recovery code. Username plus its current exact code permits atomic password/code replacement and revocation of all that account's sessions, then normal login. Codes are stored only as digests and consumed once; offline saved codes have no arbitrary clock expiry. Losing both password/code has no email/support/profile-claim bypass. Replacement code is shown once; a lost success response cannot retrieve it. Logout revokes the current account session.

**FR03 — Groups.** An account creates a fresh group or explicitly joins through a private invitation. Group names are trimmed 1–80 characters. Each account/group has one stable member; repeated joining does not duplicate it. Group selection is per browser session, independent of other sessions. Server authority derives the member from live membership, never client profile selection.

**FR04 — Administration/legacy.** Creator removal immediately denies future group access across sessions and pending work while retaining every title/contribution/history record. Rotation invalidates prior links/pending joins while existing members keep access. Removal at generation g bars invites issued at/before g; a newer rotated invite can reactivate the same member/history. Pre-removal actions cannot revive afterward. New account groups never claim, match names with, copy or convert legacy groups.

## 3. Library and personal records

**FR05 — Title data.** Save one of four types with these rules:

| Field | Requirement |
| --- | --- |
| Title | Trimmed 1–200 Unicode code points; normalized matching key |
| Type | Movie, Series, Anime or YouTube video |
| Duration | Integral 1–86400 seconds; full movie/video or typical episode |
| Numbering | None for movie/video; season+episode or continuous for episodic |
| Moods | At least one: Funny, Relaxing, Exciting, Dark, Emotional |
| Genres | Optional, up to 10 case-insensitively distinct labels of 1–40 characters |
| Watch/source/cover links | Optional; validated; unavailable images use fallback |
| Provider identity | Optional namespace+external ID, server-established |

Duration input uses whole minutes plus optional 0–59 seconds; no zero/negative/fractional runtime. Required acquired metadata may later become unavailable on expiry, without erasing identity/history.

**FR06 — Shared identity.** Manual matching uses type plus title normalized with Unicode NFKC, trimmed/collapsed whitespace and lowercase. This finds a candidate, not proof two works are identical: confirm an existing title or distinguish another work, for example by year. Provider namespace/external ID is group-unique including archive; different namespaces do not imply equality. Linking to manual identity needs confirmation. Duplicate saves add only contribution, preserving shared metadata/history. Repeated saves are idempotent.

**FR07 — Editing/archive.** Contributors edit shared metadata with collision/stale checks. Type/numbering changes are blocked after personal history exists; expired NULL type recovery is narrowly allowed with compatible unchanged numbering/history. Identity-sensitive edits require confirmation. Removing one's contribution retains others; removing the last archives the same entry. Restore/save adds a contribution to that same ID/history, not a copy. Archived titles remain readable and excluded from active picks; restore precedes ordinary active edits.

**FR08 — All/Mine.** Active account-group list defaults to All titles. Added by me contains exactly titles with the current authenticated member's contribution, still showing every adder/name/color/inactive status once. Group ownership or feedback does not imply contribution. Filter URLs contain no identity authority; invalid/repeated filters safely show All with notice. Legacy/archive remain shared All views. Filter navigation writes no history and does not affect picking.

**FR09 — Episodic progress.** Each member records **next to watch**, not last watched. Missing progress is Unknown; explicitly Not started means E1/S1E1. In progress accepts integral coordinates 1–9999; continuous numbering has no season. Seasons compare lexicographically. No episode catalog/season length is inferred. Completion/undo changes an independent flag without inventing/changing coordinates.

**FR10 — Movie/video position.** Manual stopped-at accepts M:SS or H:MM:SS, stores whole seconds and distinguishes absent from saved zero. New values require known runtime and cannot exceed it. Completion is independent and never inferred from timestamp. A later shortened/unavailable duration preserves older position with an honest warning; clearing/completion remain possible. No automatic playback tracking exists.

**FR11 — Feedback.** One whole-title rating/member is an integer 1–10; clearing means absence, not zero. Rating does not require completion/contribution. One plain-text note/member accepts up to 2000 Unicode code points, preserving line breaks and trimming outer whitespace; blank clears. No truncation/rich execution. Ratings/notes are group-visible, editable only by their owner on active titles, and never influence picks.

## 4. Metadata and previews

**FR12 — Optional lookup.** Manual entry remains fully usable without keys. YouTube supports explicit title search and strict supported video link/ID. Candidate search uses official video-only results, batched details, supplied channel/title/thumbnail and finite full runtime. Kinopoisk Unofficial provides title search, year/type/posters and selected detail. It is a third-party namespace, not official Kinopoisk access.

Only selected/current IDs become trusted reviews. Pagination uses bounded opaque context-bound handles; five page visits/chain, ten-minute snapshot lifetime and twenty-review/context retention bounds apply. YouTube requests ten candidates/page; Kinopoisk accepts its bounded twenty-item pages. No automatic crawling/search-on-keystroke.

**FR13 — Autofill/review.** Clean candidate selection/direct link success automatically fills available supported title/type/runtime/genres/source/watch/cover without another Apply click. Save remains explicit. Year/channel are review context, not invented persistent fields. Mood stays manual; missing runtime/type and episodic numbering/typical-runtime confirmation block save. Dirty metadata replacement needs clear Replace/Keep confirmation; edits during await/new selection/cancel cannot be overwritten by late responses. Switching lookup selector never silently relabels imports as manual.

For selected Kinopoisk FILM only, positive integral filmLength is interpreted as minutes and converted within runtime bounds. This is an editable app convention: inspected provider documentation did **not** confirm units. Series/invalid/missing values remain manual; anime and episode duration are not guessed.

**FR14 — Images/origins.** Actual provider HTTPS images use strict host/path validation, no-referrer,16:9 video/2:3 poster layout and missing/unsafe/broken fallback across candidate/review/list/detail/archive. No server image proxy, synthesized art or binary download/cache is supplied. Unsupported authored URL values remain stored but render fallback.

Unchanged acquired fields retain provider origin; actual corrections become user-origin. Reviews physically expire; YouTube acquired fields require refresh/delete within 30 calendar days, while Kinopoisk uses a documented **app-chosen**30-day snapshot policy. Expiry clears imported values, not contributions/progress/feedback/moods or independently authored corrections. Refresh cannot renew unavailable data or overwrite newer corrections. See [lifecycle](metadata-lifecycle.md).

## 5. Picker requirements

**FR15 — Input/eligibility.** Explicit viewers, exactly one fixed mood and integral 1–1440 available minutes are required; rewatches default off. Only authorized active-group members and active, metadata-complete titles participate. Movie/video uses full duration; episodic uses typical episode duration. Saved timestamps never subtract time.

| Selected progress | Rewatches off | Rewatches on |
| --- | --- | --- |
| Movie/video, none complete | Full item | Full item |
| Movie/video, any complete | Excluded | Full item; completed viewers labeled rewatching |
| Episodic, all unfinished same next position | That episode | That episode |
| Episodic unfinished positions differ | Excluded | Least-advanced episode; advanced viewers rewatch |
| Any unfinished Unknown | Excluded | Excluded |
| Completed plus known unfinished | Excluded | Unfinished target; completed viewers rewatch |
| All episodic viewers completed | Excluded | Restart E1/S1E1; all rewatch |

Explicit completion with valid Unknown coordinates counts known-finished; it cannot excuse another unfinished Unknown. With rewatches off, completed-viewer exclusion precedes unfinished-position checks. Malformed/cross-group progress is rejected, never repaired into eligibility. No progress is written by picking.

**FR16 — Ordered tier.** First choose matching mood/runtime<=budget, longest first. Ties use oldest original title creation then stable ID ascending. Only without exact candidates use same-mood items exceeding budget by **at most 300 seconds**, smallest overrun first. Only without either preceding tier use different-mood items within budget, longest first. Disclose exact overrun/mood mismatch. Never relax both mood/time, change inputs or bypass eligibility.

**FR17 — Pick again.** Traverse only the selected tier, without repeats of title+episode target before exhaustion; require explicit Start again. Never silently append another tier. Revalidate every action/retry. Relevant list/contribution/selected-progress changes visibly reset to fresh results; viewer/time/mood/rewatch edits discard the cycle. Ratings/notes/unselected progress do not reset it. Duplicate logical retries consume no additional item; stale/foreign cursors fail safely. Page cycles are process-local, bounded 512 records and 30 minutes from start; reload/eviction/restart may require explicit new cycle. [Exact algorithms](eligibility.md), [ranking](ranking.md), [cycle](picking-cycle.md).

## 6. Journeys, routes and data design

A normal journey is Register/save recovery code → create group/share invite → second account joins → save/manual or reviewed import → confirm duplicate contribution → update own progress → select viewers/time/mood → pick/advance → open external destination. A second journey removes contributions, archives/restores the same title; creator removal is a different operation retaining contributions.

| Route | Purpose |
| --- | --- |
| / | Separate account and legacy entry |
| /register, /login, /recover, /account | Credentials/recovery/membership switching |
| /invite/<token>, /group | Invitation continuation/join and group/member administration |
| /watchlist, /watchlist/add | All/Mine and manual/provider entry |
| /watchlist/<id>, /watchlist/<id>/edit | Detail/history and contributor correction |
| /archive, /pick | Restore historical entries; single-item picker |

Current server interfaces combine Next Server Actions and protected account/group Route Handlers; there is no claimed complete REST/OpenAPI layer yet.

| Entity | Relationship/invariant |
| --- | --- |
| Account/session | Versioned password/recovery digests; hashed expiring/revocable sessions |
| Group/member/membership | Immutable legacy/account mode; account owner; stable account-group member |
| Invitation/pending intent | Hash-only tokens; generation/revocation; short-lived join intent |
| Title/contributor | Group-scoped manual/provider identity; many contributing members |
| Genre/mood associations | Optional labels/fixed mood vocabulary |
| Progress/rating/note | One personal record per member/title, composite group ownership |
| Metadata fields/reviews | Per-field provenance/deadline; context-bound expiring snapshots |

SQLite foreign keys, unique keys, checks/triggers and immediate transactions protect cross-group references, lifecycle/concurrency and rollback. Existing migrations are immutable; initialized storage must be explicit. [Data dictionary](database.md).

## 7. Architecture and nonfunctional requirements

**NFR01 — Runtime.** Next.js 16.4.1, React 19.3.1, TypeScript 7.0.2 and native Node 24 SQLite/crypto form one local application. Require Node 24.15+ within 24.x and pnpm 11.25.0; frozen lockfile pins dependencies. Current access is native SQL, not ORM. No Python/service purchase required.

**NFR02 — Security.** Passwords use async scrypt (N=131072, r=8, p=1), random 16-byte salts and 64-byte keys. Opaque 256-bit credentials are hashed at rest; account cookies are HttpOnly/SameSite=Lax/Path=/ and Secure under HTTPS, with seven-day server expiry. Real guards check method/origin/live session/membership/context and contributor ownership; client IDs are claims only. Unknown login performs bounded dummy work. Hash work and attempts are bounded/process-local, not distributed protection.

**NFR03 — Privacy.** Keys stay server-only; code/invitation reveals are private once-only responses. No routine secret logs, browser persistent secret storage or retained auth traces. Supported launchers install framework privacy controls. Changing membership/context invalidates asynchronous review/picker authority. SQLite/backups still require private local storage.

**NFR04 — Usability.** Keyboard-accessible labeled controls, visible focus, meaningful pending/empty/error/retry states and 375px/1280px layouts are required. Safe plain text, stable image fallback and preserved form input prevent accidental loss. No formal accessibility certification/performance SLA is claimed.

**NFR05 — Operations.** Install with pnpm install --frozen-lockfile; explicitly configure WATCHNEXT_DATABASE_PATH/WATCHNEXT_APP_ORIGIN, run pnpm db:init, then pnpm dev or pnpm build followed by pnpm start. Launchers bind 127.0.0.1. Keys are optional; consistent host/port matters for origin checks. Do not run dev/build against shared output concurrently.

Use pnpm db:snapshot with explicit source/new destination for WAL-consistent private backups; stop writers, preserve sidecars at source, restore separately, initialize/maintain before use. Restored security state is snapshot-time: later resets/revocations cannot be reconstructed. Powered-off data cannot be automatically erased; maintenance/startup clears due imports when running. [Setup](local-setup.md), [backup](backup-restore.md).

## 8. Acceptance and exclusions

Release acceptance checks: two accounts cannot impersonate each other; duplicate saves show one entry/all adders; removal/rotation preserves history and rejects stale access; both provider flows autofill with manual missing gates; All/Mine reflects contributions; exact picker truth tables/tier order/cycle behavior hold; restart/backup preserves security/history with unchanged deadlines.

Verification uses Vitest/Testing Library, real isolated SQLite/transaction/contract tests, typecheck/build, pinned Playwright 1.64.1 current-source production journeys and clean-checkout recipes. pnpm test, pnpm typecheck, pnpm build, pnpm test:e2e and isolated database checks are documented in [testing](testing-guidelines.md). Historical execution passed 958 tests plus integrated journeys; this document does not claim a new test run. Privacy/sentinels/owned cleanup are mandatory.

Out of scope: embedded playback/automatic tracking, multiple-item watch sessions, email/social recovery, profile claiming/legacy conversion, ownership transfer/hard account deletion, public hosting, recommendation learning, inferred episode catalogs, genre picker filters and image uploads. Provider keys/entitlements/licensing remain unverified externally; mocks prove app contracts, not live availability. These limits do not remove the required manual path or saved-list choice goal.
