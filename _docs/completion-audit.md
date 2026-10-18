# First-release requirement and delivery audit

Dated **October 18, 2026**. This maps the agreed [plan](plan.md) and all [30 backlog issues](tasks.md) to actual source/documentation and authoritative verification. It is an evidence record, not a duplicated live issue board: GitHub comments/closure remain authoritative. #1–#29 were closed at the start of #30. The API audit found independent PASS comments for #2–#29; #1 predates the orchestrator run and has no standalone historical QA comment. Its current home/build/fresh-checkout behavior is verified below; no earlier verdict is invented. #30 must receive its own independent verdict before closure, including the baseline check.

The last pre-documentation production baseline is `f1a6a3ff9eae9587f81c08e63e67feeb0c48ac31`, with [#29 independent QA PASS](https://github.com/xiaodlb/watchnext/issues/29#issuecomment-6246402934). [#28 QA PASS](https://github.com/xiaodlb/watchnext/issues/28#issuecomment-6246227440) covers isolated demo ownership/scenarios. #30 adds documentation, the native snapshot helper and isolated walkthrough/restore verification; it does not silently replace unimplemented core behavior with a limitation.

## Agreed requirements

| Plan section / first-release requirement | Delivered behavior and evidence |
| --- | --- |
| Concept: choose from your own saved list | Real guarded `/watchlist` and `/pick`; [saved-data ranking integration](../tests/picker/ranking-saved.test.ts), [whole UI journeys](../tests/e2e/journeys.mjs). No unrelated-content discovery is used. |
| Anyone creates a group; invitation access | [Group creation](../lib/groups.ts), [sessions](../lib/sessions.ts), [invite route tests](../tests/invite-route.test.ts), actual UI invitation joins/restart in E2E. Token hashes only, configured origin, private explicit delivery. |
| Named colored profiles / trust-based privacy | [Profile state/palette](../lib/profile-state.ts), [profile service tests](../tests/profiles.test.ts), real two-context names/colors and stale-profile guard in E2E. No verified-account claim. |
| Four types; title/link, duration, genre, multiple fixed moods | [Manual validation](../lib/title-validation.ts), [manual save tests](../tests/manual-titles.test.ts), real movie/video/seasonal-series/continuous-anime UI creation; both full and typical duration meanings verified. Genres are editable metadata, with no promised genre picker filter (explicit D02). |
| One entry with several attributed contributors | [Shared save](../lib/shared-save.ts), [duplicate/race tests](../tests/shared-save.test.ts), [concurrent saves](../tests/save-concurrency.test.ts); UI confirmation, stable ID, exactly one entry and rendered names/colors in E2E. |
| Contributor-only shared editing; metadata/history precedence | [Edit tests](../tests/edit-title.test.ts), [edit action tests](../tests/edit-action.test.ts); real shared genre correction and former-contributor edit denial in E2E, unchanged personal histories. D10/D27 guard identity-sensitive changes. |
| Own removal, final archive, restored same ID/history | [Contribution service tests](../tests/contributions.test.ts), actual two-person removal/archive/manual restoration in E2E; [demo archive/history scenario](demo-data.md). Archived entries remain readable but outside active picks. |
| Separate series/anime next-to-watch progress and completion | [Episode service](../lib/episode-progress.ts), [episode tests](../tests/episode-progress.test.ts), both numbering styles and actual progress-change invalidation in E2E. Unknown differs from explicit Not started; no episode catalog/inferred season lengths. |
| Personal movie/video timestamps and independent completion | [Timestamp tests](../tests/watch-progress.test.ts), [controls](../tests/watch-controls.test.tsx); two UI timestamps and completion/undo retaining position in E2E. Duration corrections preserve older historical positions with warnings. |
| Explicit viewers, time, mood; rewatches initially off | [Picker UI/action tests](../tests/picker/picker.test.tsx), [guarded server](../tests/picker/server.test.ts), real explicit controls in E2E. Selected profile is independent of selected viewers. |
| Full duration / typical episode duration, not remaining time | [Ranking truth tables](../tests/picker/ranking.test.ts), [saved projection](../tests/picker/ranking-saved.test.ts), real 24-minute result despite partial timestamps in E2E/demo. |
| Finished/different next episodes excluded without rewatches; catch-up with rewatches | [Eligibility truth table](eligibility.md), [boundary cases](../tests/picker/eligibility.test.ts), [saved projection](../tests/picker/eligibility-saved.test.ts), real seasonal/continuous catch-up with named rewatchers in E2E. Completed viewers follow the recorded D06 precedence. |
| Longest eligible exact fit first; no early repeat | [Ranking](ranking.md), [cycle contract](picking-cycle.md), [cycle/server cases](../tests/picker/cycle-server.test.ts); real 24→18, exhaustion/explicit restart and relevant-data invalidation in E2E. Ties and fallback tiers follow delegated D18–D22. |
| Near matches explain mismatch without changing input | [Ranking boundaries](../tests/picker/ranking.test.ts); real +2-minute overrun and alternate-mood exclusion/catch-up in E2E/demo. No silent mixed relaxation or eligibility bypass. |
| External watching, no manufactured episode URL | [Safe detail tests](../tests/title-details.test.ts), [detail rendering](../tests/detail-view.test.tsx), [picker links](../tests/picker/picker.test.tsx), focused [browser external-link check](../tests/fixtures/picker-browser-check.mjs). Missing links use an honest unavailable state; opening links writes no progress. |
| Individual 1–10 ratings and personal plain-text notes visible to group | [Ratings](../tests/ratings.test.ts), [notes](../tests/notes.test.ts), [concurrency preservation](../tests/note-concurrency.test.ts), real separate 9/6 ratings and inert multiline notes through edit/archive/restore in E2E. Rating before completion is the documented delegated #22 choice, not a missing completion gate; ratings never influence picks. |
| Manual entry plus YouTube and Кинопоиск lookup/review/correction | [Normalized contract](metadata-contract.md), [YouTube tests](../tests/metadata/youtube.test.ts), [Kinopoisk tests](../tests/metadata/kinopoisk.test.ts), [review/lifecycle tests](../tests/metadata/reviews.test.ts), actual synthetic-outbound lookup/review/provenance/manual fallback in E2E. Configured code is delivered; live account/rights verification is not claimed. |
| Persistent private SQLite group/history | [Migration/schema checks](../tests/db/schema.test.ts), [persistent connection](../tests/db/persistence.test.ts), real server restart E2E, explicit init and [WAL-safe restore](backup-restore.md). Server-side group/record ownership guards and forged/stale request tests preserve isolation. |
| Local academic setup and presentation | [Setup/troubleshooting](local-setup.md), [demo](demo-data.md), [testing](testing-guidelines.md), [backup](backup-restore.md), named isolated guide/restore evidence below. 127.0.0.1 loopback, supported privacy launchers and exact origin/port are explicit. |

No agreed core requirement is intentionally deferred. Mixed multi-item sessions, embedded/automatic playback, separate verified accounts, public hosting and preference learning are the explicitly excluded later scope, not substitutes for missing first-release work. Optional covers/links may be absent; typical runtime is not fabricated. Provider availability/entitlements/rights remain external limits (U01), not false implementation placeholders. No new unrelated feature request or unresolved core audit defect was identified during this review; any concrete regression still requires its owning issue/PM clarification.

## All backlog deliverables

Each linked issue contains the authoritative original criteria, Engineer evidence and independent QA where completed. Source/test links above and below remain reviewable without chat history.

| Issue | Concrete delivery / verification anchor |
| --- | --- |
| [1](https://github.com/xiaodlb/watchnext/issues/1) Empty project and passing test | Next/TypeScript exact package/lockfile; [home smoke](../tests/home.test.tsx), real production builds. |
| [2](https://github.com/xiaodlb/watchnext/issues/2) Behavior decisions | [Decision record](decisions.md): explicit D01/D02 versus delegated D03–D28, retained rationale and U01 limits. |
| [3](https://github.com/xiaodlb/watchnext/issues/3) Provider feasibility | [Primary-source research](metadata-providers.md), exact official versus third-party provenance, fields/access/error/policy limits. |
| [4](https://github.com/xiaodlb/watchnext/issues/4) SQLite schema | [Immutable migrations](../db/migrations), migration tests and 12 schema acceptance checks. |
| [5](https://github.com/xiaodlb/watchnext/issues/5) Local persistence | [Connection](../db/connection.ts), explicit init, isolated fresh-process persistence and boundary tests. |
| [6](https://github.com/xiaodlb/watchnext/issues/6) Shell | [Design system](design-system.md), [navigation test](../tests/navigation.test.tsx), actual 375/1280 keyboard/no-overflow E2E. |
| [7](https://github.com/xiaodlb/watchnext/issues/7) Groups/invites | [Creation action tests](../tests/create-group-action.test.ts), real create/copy-field/join E2E. |
| [8](https://github.com/xiaodlb/watchnext/issues/8) Session/access | [Access tests](../tests/access.test.ts), [framework privacy](../tests/framework-privacy.test.ts), actual forged/cross-group/stale boundary E2E. |
| [9](https://github.com/xiaodlb/watchnext/issues/9) Profiles | [Profile actions](../tests/profile-action.test.ts), real named/color selection in independent browsers. |
| [10](https://github.com/xiaodlb/watchnext/issues/10) Manual entry | [Form/action tests](../tests/save-title-action.test.ts), all four UI-created types in E2E. |
| [11](https://github.com/xiaodlb/watchnext/issues/11) Active list | [Query](../tests/watchlist.test.ts), [render](../tests/watchlist-view.test.tsx), persisted attributed list/reload E2E. |
| [12](https://github.com/xiaodlb/watchnext/issues/12) Details/links | [Details tests](../tests/title-details.test.ts), real group-only details and archived history. |
| [13](https://github.com/xiaodlb/watchnext/issues/13) Shared saves | [Race/merge tests](../tests/save-concurrency.test.ts), UI duplicate confirmation and one stable ID. |
| [14](https://github.com/xiaodlb/watchnext/issues/14) Shared editing | [Edit service](../tests/edit-title.test.ts), current revision/collision/history protection and real permitted edit/denied former contributor. |
| [15](https://github.com/xiaodlb/watchnext/issues/15) Archive/restore | [Contribution tests](../tests/contributions.test.ts), real partial/final removal and explicit same-ID restoration. |
| [16](https://github.com/xiaodlb/watchnext/issues/16) Metadata contract | [Pure normalized contract](metadata-contract.md), [synthetic validator cases](../tests/metadata/lookup.test.ts). |
| [17](https://github.com/xiaodlb/watchnext/issues/17) YouTube | [Adapter](youtube-adapter.md), strict URL/fixed transport/timeouts/live-runtime/error boundaries, outbound-mocked real save. |
| [18](https://github.com/xiaodlb/watchnext/issues/18) Kinopoisk | [Adapter](kinopoisk-adapter.md), fixed third-party search/detail, unsupported-type/unknown-runtime handling and explicit candidate E2E. |
| [19](https://github.com/xiaodlb/watchnext/issues/19) Review/save/lifecycle | [Lifecycle](metadata-lifecycle.md), [migration](../tests/metadata/migration.test.ts), [maintenance](../tests/metadata/maintenance.test.ts), trusted UI correction/provenance/fallback E2E. |
| [20](https://github.com/xiaodlb/watchnext/issues/20) Episode progress | [Episode cases](../tests/episode-progress.test.ts), independent next positions/completion and both styles in real UI. |
| [21](https://github.com/xiaodlb/watchnext/issues/21) Timestamp progress | [Timestamp cases](../tests/watch-progress.test.ts), independent completion/legacy bounds and real two-context timestamps. |
| [22](https://github.com/xiaodlb/watchnext/issues/22) Ratings | [Service/concurrency](../tests/rating-concurrency.test.ts), real independent whole-title ratings preserved through restore. |
| [23](https://github.com/xiaodlb/watchnext/issues/23) Notes | [Unicode/plain-text tests](../tests/notes.test.ts), [concurrent ownership](../tests/note-concurrency.test.ts), real inert multiline notes. |
| [24](https://github.com/xiaodlb/watchnext/issues/24) Eligibility | [Truth table](eligibility.md), pure/saved-DB tests, actual progress-based UI targets. |
| [25](https://github.com/xiaodlb/watchnext/issues/25) Ranking/fallback | [Ranking contract](ranking.md), exact seconds/tier boundaries/ties and persisted projections. |
| [26](https://github.com/xiaodlb/watchnext/issues/26) Picker UI | [Picker tests](../tests/picker/picker.test.tsx), authorized fresh snapshots, one result/disclosures/real details links. |
| [27](https://github.com/xiaodlb/watchnext/issues/27) Pick again | [Page-cycle contract](picking-cycle.md), [cycle tests](../tests/picker/cycle.test.ts), no-repeat/exhaustion/restart/invalidation E2E. |
| [28](https://github.com/xiaodlb/watchnext/issues/28) Demo data | [Demo guide](demo-data.md), [path/reset/rollback tests](../tests/demo.test.ts), real isolated demo browser smoke. |
| [29](https://github.com/xiaodlb/watchnext/issues/29) Whole journey | [Portable runner](../tests/e2e/run.mjs), real UI/persistence/guards/restart and synthetic outbound-only providers, repeated fresh runs/failure cleanup. |
| [30](https://github.com/xiaodlb/watchnext/issues/30) Setup/backup/presentation | [Local guide](local-setup.md), [backup recipe](backup-restore.md), this audit, isolated WAL/expiry tests and fresh-checkout walkthrough. Independent QA/closure belongs to its live issue, not this document. |

## Reproduce the fresh-checkout walkthrough

From a clean committed checkout with the pinned prerequisites installed, run `pnpm verify:fresh-checkout`. It makes a local Git clone without hardlinks in its own checked OS-temp root (tracked files only, no normal `.env.local`), installs from the lockfile, installs the matching Chromium, and runs `pnpm verify:guide` inside that clone. The inner command refuses an ordinary workspace; it explicitly initializes its own path-with-spaces database, uses actual `pnpm dev/start` launchers on one available origin/port, exercises real group/profile/list/details/edit/picker/archive/restore, then runs the actual demo preparation/private-display/repeat/reset CLI in an OS home verified to be temporary. It captures one-off links privately rather than exporting them. Normal/default/demo files and existing browser profiles are never selected.

The outer command then runs the documented full unit/type/build/schema/persistence/backup/E2E checks serially inside the clone. Owned process trees are stopped by their captured PID, never by name; only the resolved owned clone/temp root is removed. Provider keys are empty/synthetic, application mutations are real, and routine/generated output is scanned for synthetic credentials. It prints safe source revision/command summaries. A failing command exits nonzero and cleans owned resources; no failed walk-through is described as a pass. Real normal setup commands remain in [local setup](local-setup.md); this command is validation rather than ordinary app initialization.

## Verification record

Executed October 18, 2026 on **Windows, Node v24.19.0, pnpm11.25.0, pinned Playwright1.64.1 and its installed headless Chromium**. `pnpm verify:fresh-checkout` passed from clean committed source **`18913fd6c2cbf4900bdcc98b670db87fb3a344b2`**. Its local clone (no hardlinks or copied normal environment files) actually ran:

| Command / outcome | Evidence |
| --- | --- |
| `pnpm install --frozen-lockfile` | Fresh clone installed exact committed dependencies. |
| `pnpm exec playwright install chromium` | Matching browser setup completed; no hidden runtime path. |
| `pnpm verify:guide` | Explicit path-with-spaces initialization/repeat, real `pnpm dev --port <owned-port>`, current build and `pnpm start --port <same-port>`, home/group/profile/list/details/edit/picker/archive/restore, persisted timestamp; real demo CLI prepare/show/repeat/reset and exact/catch-up/near-match in isolated verified child home; routine/generated credential scans passed. |
| `pnpm test` | 784 tests passed; includes original home baseline, current features, four snapshot cases and real owned-process shutdown regression. |
| `pnpm typecheck`, `pnpm build` | Passed all type/compile/static generation checks; existing migration filesystem-tracing warning remains. |
| `pnpm db:verify` | All 12 migration/constraint checks passed. |
| `pnpm db:verify:persistence` | Fresh-process persistence and separate-file isolation passed. |
| `pnpm db:verify:backup` | WAL-aware snapshot/restore, IDs/history/provenance/deadlines, source/sentinel preservation and real offline expiry/physical main-file clearing passed. |
| `pnpm test:e2e` | Complete real two-context 375/1280 journeys passed, including synthetic outbound-only providers, ownership/stale-session guards, restart persistence, no-repeat/disclosures and cleanup/privacy/sentinel audits. |

The owned clone, runtime databases, browser and server trees were removed/closed. Subsequent #30 edits strengthen backup readback to every logical table and run the actual quoted `pnpm db:snapshot` CLI for backup and restore, plus documentation/ignore reconciliation; focused current-source verification passed. No application runtime/schema changed after that fresh-checkout revision. Current final command results are recorded in the Engineer/QA comments on #30 rather than pretending this dated record is live issue state.

The walkthrough initially exposed a **verification-harness** Windows shutdown acknowledgement race; it now waits for the actual owned child exit after tree termination, with a real-process regression. Failed runs cleaned their owned clones and were not counted as passes. No product-core gap was discovered. Hosted Linux/macOS, authenticated providers, playback and public hosting were not exercised or claimed. First-release feature limitations/deferred scope remain those expressly listed above, not hidden dropped requirements.
