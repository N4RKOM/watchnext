# Viewer eligibility — issue #24

`evaluateEligibility` in `lib/picker/eligibility.ts` accepts readonly types from `lib/picker/types.ts`, without database/provider/clock/network/framework dependencies or writes. Outcomes follow input order. Delivered #25–#27 ranking/fallback/page/cycle integration consumes this pure operation; it does not rank internally.

The caller must authorize the actual session/group, load that group's members/titles/progress and enforce metadata expiry **before** taking a fresh snapshot (as the existing detail read does). A supplied group ID does not authenticate anything. #26 owns the runtime caller; no new query/route/write is introduced here. Tests project actual saved records through existing authorized fresh detail reads; that projection is test-only.

## Contract

Inputs contain `groupId`, `members` (`id,groupId`), `titles`, saved `progress`, explicit `selectedViewerIds` and optional boolean `rewatches` (default false). Omitted progress means no row; never manufacture Not started. Retain a stored completion-only Unknown row as completed. Convert database completion integers to booleans and display mood labels to canonical `fixedMoods` codes: funny, relaxing, exciting, dark, emotional. Progress means next-to-watch, not last-watched. Ratings, notes, timestamps and optional links/genres/covers are outside the required projection and have no influence.

Results are discriminated:

- `invalid_input`: `invalid_context` for malformed outer snapshot or `invalid_rewatches` for nonboolean permission (including null/string/number). Never coerce permission.
- `invalid_selection`: `empty_selection`, `duplicate_viewer` or `unavailable_viewer` for no viewers, repeated IDs, or absent/ambiguous/outside-group IDs. No title outcomes or foreign metadata accompany errors.
- `evaluated`: effective `rewatches` and one eligible/excluded outcome per input title. A valid empty list returns `titles: []`, distinct from invalid input. No automatic viewer/filter relaxation.

Eligible outcomes carry same-group stable `titleId`, `inputIndex`, unchanged full/typical `durationSeconds`, explicit item/episode `target`, and `rewatchingViewerIds` in selection order. Episode targets contain numbering style, season (null for continuous), next episode, `restart` and `catchUp`. Catch-up means an unfinished viewer sets the target while another is ahead or complete. Restart means all selected viewers are complete. Neither flag changes stored history.

Exclusions have stable codes, safe readable messages and relevant selected `viewerIds`: `wrong_group`, `archived`, `metadata_incomplete`, `invalid_progress`, `completed_viewer`, `unknown_progress`, `different_positions`. The latter also includes selected member coordinates for later mismatch explanations. Wrong-group outcomes expose only input index, generic code/message and empty viewers, omitting even the foreign title ID. Messages never interpolate names, provider data or optional fields.

Required metadata: nonblank title within 200 Unicode code points; movie/series/anime/youtube; integer duration 1–86400 seconds; at least one canonical mood and no unsupported mood; compatible numbering (`none` for movie/video, continuous/season_episode for series/anime). NULL/invalid/expired values are incomplete, never inferred from progress or treated as zero. Missing optional links/covers/genres do not block. Group/archive checks precede metadata/progress.

Selected progress must be unique per title/member, same-group, matching numbering style, with boolean completion. Violations return invalid_progress. Unselected/other-title history is ignored. Movie/video timestamps neither imply completion nor reduce runtime. Episodic state must be Unknown with NULL coordinates, Not started at exactly episode 1 (season 1 if seasonal), or In progress with integer coordinates 1–9999. Continuous has no season. Malformed stored states/coordinates exclude even if complete; missing or valid Unknown unfinished rows return unknown_progress. Completed viewers need no retained position: valid Unknown/NULL coordinates are sufficient, and retained known coordinates do not select the target. Row ownership/style/validity still apply. After validation, off returns completed_viewer before unfinished Unknown/differing positions. On requires every unfinished position: completion cannot license an unfinished Unknown.

## Decision trace and truth table

Rules follow [plan.md](plan.md) and [decisions.md](decisions.md): D03 next-to-watch, D04 bounds, D05 lexicographic seasons, D06 Unknown/Not started, D07 completion/restart, D17 full exact seconds, D24 explicit completion and D26 optional links. The scoped D06/D07 clarification was adopted October 17, 2026 under the user's October 15 delegated authority, not an individually explicit answer: **unfinished Unknown blocks; completed Unknown is known-finished**. This avoids fabricated coordinates and preserves completion-only actions. D18–D20 ranking/fallback are delivered separately in [#25's pure ranking module](ranking.md); D21–D22 are delivered in [#27's page-cycle protocol](picking-cycle.md).

These rows run for both continuous and seasonal numbering in `tests/picker/eligibility.test.ts`, with explicit reason/target assertions. Seasonal 3 means S1E3; U means absent or explicit unfinished Unknown; C(U) is explicitly completed with Unknown; NS is explicitly Not started.

| Selected states | Rewatches off (default) | Rewatches on |
|---|---|---|
| Single 3 | Target 3 | Target 3 |
| NS alone / NS and in-progress 1 | Target 1 | Target 1 |
| 3 and 3 | Target 3 | Target 3, no rewatchers |
| 3 and 7 | Different positions | Target 3; viewer at 7 rewatching, catch-up |
| NS and 7 | Different positions | Target 1; viewer at 7 rewatching |
| Single U / 3 and U | Unknown progress | Unknown progress |
| Completed 3 or C(U), unfinished 7 | Completed viewer | Target 7; completed viewer rewatching |
| Completed viewer, unfinished U | Completed viewer | Unknown progress |
| All completed, retained known or Unknown | Completed viewer | Restart 1; everyone rewatching |
| S1E12 and S2E1 | Different positions | S1E12; S2E1 viewer rewatching |
| Movie/video absent or end timestamp, unfinished | Full item eligible | Full item eligible |
| Movie/video any selected completed | Completed viewer | Full item; completed viewers rewatching |

Other named tests cover all four types, bounds, invalid metadata/progress/selection, privacy, frozen input, unrelated history/feedback invariance and dependent-title-only changes. `tests/picker/eligibility-saved.test.ts` uses migrated isolated in-memory SQLite and real group/profile/save/progress/feedback/archive/restore/freshness services, then invokes the pure engine and verifies no engine writes/history changes.

Run `pnpm exec vitest run tests/picker --reporter=verbose` for named cases; normal `pnpm test` includes both files. No browser check is needed: this module adds no runtime UI/action/route. No provider credentials or normal database are involved.
