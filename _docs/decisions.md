# WatchNext first-release decisions

Source: [issue #2](https://github.com/xiaodlb/watchnext/issues/2) and the [project scope](plan.md).
Recorded: October 15, 2026.

This record makes behavior reviewable without chat history. It does not implement features. The schema decisions below now record explicit approval or resolution under delegated authority.

## Status and approval rules

- **Approved** means the user explicitly selected this behavior; the source is the linked project scope or the recorded October 15, 2026 answer.
- **Delegated decision** means the agent selected the documented recommendation under the user's October 15, 2026 directive: “do not ask me.do all by yourself with the answers that you do will be best suitble”. It does not claim a separate explicit answer to that decision.
- **Proposed** means not yet resolved in the relevant feature task. The user has authorized suitable defaults; record a reasoned delegated resolution before relying on one.
- **Unresolved** means there is no reliable recommendation yet. The exact question and affected issues are recorded below.

Implementers must distinguish explicit approval from delegated choice. Record future resolutions against their decision IDs with source and rationale. Issue #4 resolves only its schema-affecting subset; remaining proposals are resolved by their owning feature tasks without further approval questions under the documented delegation.

## Approved baseline

All rows in this table have status **Approved**, based on the corresponding sections of [plan.md](plan.md).

| ID | Decision | Rationale | Observable example |
| --- | --- | --- | --- |
| A01 | Use one shared list per group with multiple attributed contributors per title. | Preserve group ownership without separate copies. | Anna and Max save one title; the list shows one entry, “Added by Anna, Max.” |
| A02 | Any contributor may edit shared metadata; members manage their own progress and feedback. | Shared contribution and personal history have different owners. | Anna edits their jointly saved title; Max's progress is unchanged. |
| A03 | Removing the last contribution archives the title; saving it again restores the same entry and history. | Preserve the group's record. | A restored title still shows Anna's earlier note and score. |
| A04 | Use invite links, selectable names, and avatar colors without individual accounts. Anyone may create a group. | Keep the academic app simple. | An invited visitor selects Max's profile; this does not verify they are Max. |
| A05 | Each member has independent episodic progress; each title uses season/episode or continuous numbering and one typical episode duration. | Accommodate series and anime without an episode catalog. | Anna has episode 3, Max episode 7, on the same 22-minute series. |
| A06 | Filter on full movie/video duration, never remaining time. | The user chose full-duration matching. | A 90-minute movie paused at 70 minutes is not a 20-minute exact fit. |
| A07 | Select viewers explicitly, choose time and mood, and return one pick. Rewatches are off by default. | Keep the decision flow small and explicit. | Two selected viewers get one result, not a shortlist. |
| A08 | Without rewatches, exclude anything any selected viewer finished and series whose next episodes differ. With rewatches, allow catch-up for the least advanced viewer. | Respect selected viewers' progress. | Anna at 3 and Max at 7 excludes the series until rewatches are allowed; then episode 3 can be suggested. |
| A09 | Rank exact matches longest-first within the time budget. Pick again advances without early repeats. | Favor the closest time fit consistently. | With 25 minutes available, 24 minutes precedes 18 minutes. |
| A10 | Allow multiple moods from a fixed list; ratings use a 1–10 scale and ratings/notes are group-visible. Ratings do not affect picks. | Keep filters consistent and feedback separate from recommendation logic. | A funny/relaxing title matches funny; a low score does not remove it from picks. |
| A11 | Use external watch links, manual entry, and YouTube plus Кинопоиск lookup when supported. Mixed sessions are deferred. | Keep the first release focused. | A saved item opens on its external service; an API failure still permits manual entry. |
| A12 | Use Next.js, TypeScript, and local SQLite for an academic project. | Support a laptop demonstration with local persistence. | The app runs at localhost; no public hosting is required. |

## Schema-affecting approval gate

[Issue #4](https://github.com/xiaodlb/watchnext/issues/4) resolves the following data contracts before schema implementation. D01/D02 were explicitly approved on October 15, 2026; D03–D17, D23–D25, and D27 are delegated decisions recorded below with their original rationale/examples retained.

| Decision | Schema question | Affected issues |
| --- | --- | --- |
| D01–D02 | Fixed mood values, genre storage, required/optional metadata | [#4](https://github.com/xiaodlb/watchnext/issues/4), [#10](https://github.com/xiaodlb/watchnext/issues/10) |
| D03–D07 | Meaning, coordinates, absence, and completion of episodic progress | [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#24](https://github.com/xiaodlb/watchnext/issues/24) |
| D08–D10, D27 | Identity uniqueness, provider namespaces, history-sensitive edits, metadata precedence | [#4](https://github.com/xiaodlb/watchnext/issues/4), [#13](https://github.com/xiaodlb/watchnext/issues/13), [#14](https://github.com/xiaodlb/watchnext/issues/14) |
| D11–D13 | Feedback target, score precision, note size and cardinality | [#4](https://github.com/xiaodlb/watchnext/issues/4), [#22](https://github.com/xiaodlb/watchnext/issues/22), [#23](https://github.com/xiaodlb/watchnext/issues/23) |
| D14–D16 | Member-name uniqueness and group-scoped profile/session references | [#4](https://github.com/xiaodlb/watchnext/issues/4), [#8](https://github.com/xiaodlb/watchnext/issues/8), [#9](https://github.com/xiaodlb/watchnext/issues/9) |
| D17, D23–D25 | Duration/timestamp units, bounds, nullability, and completion state | [#4](https://github.com/xiaodlb/watchnext/issues/4), [#21](https://github.com/xiaodlb/watchnext/issues/21) |

The remaining picker and external-link proposals gate their feature issues rather than the initial schema. Provider research U01 must not prevent manual-entry storage; nullable provider fields can be represented without claiming a particular API is usable.

## Detailed behavior decisions

Each entry states its own status. D01/D02 retain the exact recommendations explicitly approved in the planning answers on October 15, 2026. The schema-affecting delegated entries adopt their existing recommendations because their recorded rationale suits a small manual-entry academic app; their original approval questions remain as historical context, not pending requests. D26/D28 are resolved in issue #12 below. Non-schema D18–D22 remain Proposed until their owning tasks record a delegated choice.

### D01. Fixed moods

- **Status:** Approved — explicit user answer, October 15, 2026.

- **Recommendation:** Use Funny, Relaxing, Exciting, Dark, and Emotional as the first-release list. Require at least one mood per title; permit several. The picker selects one mood.
- **Rationale:** These are the five examples already discussed and support predictable matching without custom tags.
- **Example:** A title tagged Funny and Relaxing appears for either selection; saving with no mood shows “Choose at least one mood.”
- **Approval question:** Should these five moods be the complete initial list, with at least one required on every title?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#10](https://github.com/xiaodlb/watchnext/issues/10), [#25](https://github.com/xiaodlb/watchnext/issues/25), [#26](https://github.com/xiaodlb/watchnext/issues/26).

### D02. Genres and metadata input

- **Status:** Approved — explicit user answer, October 15, 2026.

- **Recommendation:** Store an optional list of genre labels, editable after import, without a genre picker filter in the first release. Trim and deduplicate labels ignoring case; allow up to 10 labels of 40 characters each. Require a trimmed title of 1–200 characters and one of the four supported content types. Links and covers remain optional.
- **Rationale:** Provider vocabularies may differ; optional labels avoid blocking YouTube/manual entries that have no useful genre.
- **Example:** “ Comedy ” and “comedy” produce one displayed Comedy label; an empty genre list still saves, while a blank title does not.
- **Approval question:** May genres be optional labels with these limits and no first-release genre filter, and may titles use the stated bounds?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#10](https://github.com/xiaodlb/watchnext/issues/10), [#14](https://github.com/xiaodlb/watchnext/issues/14), [#19](https://github.com/xiaodlb/watchnext/issues/19).

### D03. Episode position means next to watch

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Persist the next episode to watch, not the last completed episode. Label controls “Next episode.” Marking an episode watched advances the position only when the member provides the next valid coordinate or explicitly confirms the next continuous episode.
- **Rationale:** It maps directly to the agreed picker examples and avoids off-by-one ambiguity.
- **Example:** Next episode 3 means the picker targets episode 3; after finishing it, the member sets next episode 4.
- **Approval question:** Should stored episodic progress always mean the next episode to watch, with explicit manual updates?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#24](https://github.com/xiaodlb/watchnext/issues/24).

### D04. Valid episode coordinates

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Accept whole-number seasons and episodes from 1 to 9999. Season/episode titles require both coordinates; continuous titles require only the episode. Unknown progress uses absent coordinates, never episode 0. Specials/season 0 are not automatically represented by this convention.
- **Rationale:** Validate inputs without inventing catalog limits that the app does not know.
- **Example:** Season 2 episode 1 saves; episode 0, 2.5, or a missing season in season/episode mode shows an error.
- **Approval question:** Should the initial coordinate convention be positive integers up to 9999, with missing values reserved for unknown progress?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#24](https://github.com/xiaodlb/watchnext/issues/24).

### D05. Season transitions

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Order season/episode positions lexicographically, but never infer a season's episode count. A member enters the new season and episode manually. Continuous numbering increments within its numeric bound without inventing a final episode.
- **Rationale:** The first release has no dependable episode catalog.
- **Example:** After S1E12, the member explicitly sets S2E1; the app does not guess whether S1E13 exists. S1E12 sorts before S2E1.
- **Approval question:** Should season transitions remain manual and comparison use season first, then episode?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#24](https://github.com/xiaodlb/watchnext/issues/24).

### D06. Unknown and unstarted progress

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Keep Unknown distinct from explicitly Not started. Not started maps to S1E1 or episode 1; Unknown has no target episode and excludes that series from group picks even when rewatches are enabled. Ask that viewer to set a position. For movies/videos, absent progress means not marked completed, with no fabricated timestamp.
- **Rationale:** Unknown episodic progress cannot safely establish spoiler eligibility.
- **Example:** Anna at 3 and Max Unknown yields “Set Max's episode first”; setting Max Not started permits episode 1 with rewatches on.
- **Approval question:** Should unknown episodic progress block picks while explicitly unstarted means episode 1?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#21](https://github.com/xiaodlb/watchnext/issues/21), [#24](https://github.com/xiaodlb/watchnext/issues/24).

### D07. Completed-series rewatches

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Store completion separately from the retained last-entered position. With rewatches off, any completed selected viewer excludes the series. With rewatches on, completed viewers can rewatch the least advanced unfinished viewer's next episode; if all selected viewers completed the series, target S1E1 or episode 1 and label it a restart. Do not alter anyone's progress by suggesting a rewatch.
- **Rationale:** Define the all-finished case without erasing completion or inventing a next episode.
- **Example:** Anna completed and Max next 7 yields episode 7 with rewatches on; both completed yields episode 1.
- **Approval question:** Should all-finished series restart at episode 1 for suggestions, with completion/history preserved until manually changed?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#24](https://github.com/xiaodlb/watchnext/issues/24).

### D08. Manual duplicate candidates and ambiguity

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Compare title plus content type using a title key formed by Unicode NFKC normalization, trimming, collapsing internal whitespace to one space, and locale-independent lowercasing. This finds manual duplicate candidates, not proof of identity. Ask the saver to select an existing match or distinguish a genuinely different work by editing its displayed title, for example adding its year. Never silently merge ambiguous candidates. Confirmed matches, including archived ones, retain their entry ID/history.
- **Rationale:** Identical names can describe remakes or different works; one shared entry still needs deliberate identity matching.
- **Example:** Entering “ dune ” as a movie finds Dune; the saver selects it or changes the title to Dune (1984) for a different work.
- **Approval question:** Should manual matching require confirmation and ambiguous new works require a distinguishable title rather than silent merging?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#10](https://github.com/xiaodlb/watchnext/issues/10), [#13](https://github.com/xiaodlb/watchnext/issues/13), [#15](https://github.com/xiaodlb/watchnext/issues/15).

### D09. Provider identity and collisions

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Match a known provider namespace plus its external ID uniquely within a group, including archived records. Different namespaces' IDs do not imply equality; missing identifiers remain absent. Linking an import to an existing manual entry requires confirmation and an unoccupied identity. If that provider identity already belongs to another group entry, show the existing entry instead of merging histories automatically.
- **Rationale:** Preserve provider identity and prevent accidental cross-provider or cross-group merges.
- **Example:** YouTube ID abc and a Кинопоиск-provider ID abc do not merge; two saves of the same YouTube ID in one group share one entry.
- **Approval question:** Should provider identity use group + namespace + external ID, with manual linking confirmed and collisions redirected to the existing entry?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#13](https://github.com/xiaodlb/watchnext/issues/13), [#14](https://github.com/xiaodlb/watchnext/issues/14), [#19](https://github.com/xiaodlb/watchnext/issues/19).

### D10. History-sensitive title edits

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Ordinary metadata edits preserve all member history. Reject changes of content type or episode-numbering style once any progress, rating, or note exists; allow them before history exists with valid fields. Identity changes require collision checks and explicit confirmation. Do not auto-convert episode coordinates or merge histories.
- **Rationale:** A small first release cannot reliably translate arbitrary histories between title meanings.
- **Example:** A contributor cannot change a season/episode series to continuous numbering when Max has S2E3 saved; Max's history remains intact after the rejected edit.
- **Approval question:** Should type/numbering changes be blocked once personal history exists, while collision-free identity edits require confirmation?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#14](https://github.com/xiaodlb/watchnext/issues/14).

### D11. Feedback target

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Store one rating and one note per member per title for the first release, including series/anime. Episode-specific feedback is not implemented by this proposal.
- **Rationale:** Title-level feedback keeps cardinality and UI consistent across the four content types.
- **Example:** Anna's rating on a series is labeled “Series rating”; moving from episode 3 to 4 does not create a second score.
- **Approval question:** Should all first-release ratings and notes be title-level only?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#22](https://github.com/xiaodlb/watchnext/issues/22), [#23](https://github.com/xiaodlb/watchnext/issues/23).

### D12. Rating precision and clearing

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Use whole-number scores 1–10. Clearing a score removes that member's rating; absence displays “Not rated,” never 0. No rating is required to mark something completed.
- **Rationale:** Clarify the approved scale without introducing fractional precision or mandatory feedback.
- **Example:** 1 and 10 save; 7.5 does not; clearing 7 displays Not rated and leaves Max's score unchanged.
- **Approval question:** Should the 1–10 scale accept integers only, with clearing represented by no rating?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#22](https://github.com/xiaodlb/watchnext/issues/22).

### D13. Note limits and empty text

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Accept plain-text notes up to 2000 Unicode code points, with line breaks preserved. Trim outside whitespace; saving a blank note clears it after explicit UI feedback. Escape text on display; no rich text or attachments.
- **Rationale:** Bound input while preserving useful personal comments safely.
- **Example:** A 2000-character note saves; 2001 is rejected without truncation; script-like text appears as text; whitespace-only input clears the member's note.
- **Approval question:** Should notes use this 2000-code-point plain-text limit and blank-clears behavior?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#23](https://github.com/xiaodlb/watchnext/issues/23).

### D14. Profile names and colors

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Trim names, apply Unicode NFKC normalization, collapse internal whitespace to one space, require 1–40 Unicode code points, and enforce uniqueness within a group using a locale-independent lowercase key. Preserve display casing and permit the same name in another group. Colors must come from the UI's fixed accessible palette; exact palette values belong to the design system, not this decision record.
- **Rationale:** Avoid indistinguishable selectable profiles and arbitrary unreadable colors.
- **Example:** Creating “ anna ” when Anna exists in that group shows “Name already used”; Anna can exist independently in another group.
- **Approval question:** Should names be unique ignoring case within each group with these bounds, and colors restricted to the shared palette?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#6](https://github.com/xiaodlb/watchnext/issues/6), [#9](https://github.com/xiaodlb/watchnext/issues/9).

### D15. Profile/session persistence

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Remember group access and the active member for the browser session using server-controlled session context. Reloads retain the choice; a separate browser context starts independently. No guaranteed persistence after browser-session end. Missing/stale member references return to the selector without changing history; reject wrong-group IDs on the server.
- **Rationale:** Match the planned session behavior without claiming durable authenticated identity.
- **Example:** Reloading keeps Anna active; a private browser window can select Max; a stale member ID shows the selector.
- **Approval question:** Should access and active-profile choice last for the browser session, with stale references returning to selection?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#8](https://github.com/xiaodlb/watchnext/issues/8), [#9](https://github.com/xiaodlb/watchnext/issues/9).

### D16. Group switching

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Support one active group per browser session. Opening another valid invite replaces active group context and clears active-member selection; existing groups' records remain unchanged. Do not introduce a cross-group account or group dashboard. Invalid invites do not replace valid active context.
- **Rationale:** Define switching without adding personal accounts or membership discovery.
- **Example:** Anna in group A opens group B's valid invite and selects a B profile; A's progress remains unchanged. An invalid invite shows an error without silently switching groups.
- **Approval question:** Should switching invites replace the active group and require profile selection again, without deleting prior group data?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#8](https://github.com/xiaodlb/watchnext/issues/8), [#9](https://github.com/xiaodlb/watchnext/issues/9).

### D17. Duration and time input

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Store durations/timestamps in whole seconds. Enter manual duration as minutes and optional seconds, and available time as whole minutes from 1 to 1440. Permit title durations from 1 second to 86400 seconds; compare exact seconds, display minutes plus seconds when needed. Positive fractional minute inputs must use the seconds control instead of silent rounding.
- **Rationale:** Preserve video precision while keeping the time budget easy to enter.
- **Example:** A 25-minute budget is 1500 seconds; 25:01 exceeds it, while 25:00 fits. Zero time is rejected.
- **Approval question:** Should time use exact whole seconds with these bounds and whole-minute available-time input?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#10](https://github.com/xiaodlb/watchnext/issues/10), [#21](https://github.com/xiaodlb/watchnext/issues/21), [#25](https://github.com/xiaodlb/watchnext/issues/25), [#26](https://github.com/xiaodlb/watchnext/issues/26).

### D18. Exact-match ties

- **Status:** Proposed.

- **Recommendation:** Sort exact matches by duration descending, then original title-entry creation time ascending, then stable entry ID ascending. Additional contributors or restoration do not reset creation time.
- **Rationale:** Deterministic ties make Pick again understandable and give older saved entries priority.
- **Example:** Two 22-minute matches show the older entry first; identical creation times are broken by ID consistently.
- **Approval question:** Should equal-duration matches use oldest entry first, then stable ID?
- **Affected:** [#25](https://github.com/xiaodlb/watchnext/issues/25), [#27](https://github.com/xiaodlb/watchnext/issues/27).

### D19. Near-match fallback

- **Status:** Proposed.

- **Recommendation:** Use fallback only if there are no exact mood-and-time matches. First offer same-mood viewer-eligible items up to 5 minutes over budget, smallest overrun first. If none exist, offer different-mood viewer-eligible items within budget, longest first. Apply D18 ties after the primary order. Do not relax both mood and time together or relax viewer eligibility.
- **Rationale:** Preserve the requested mood first while bounding the cost of an overrun.
- **Example:** With 25 minutes/Funny and no exact match, a 28-minute Funny item shows “3 minutes longer.” If none fit that fallback tier, a 24-minute Dark item can show “Different mood: Dark.”
- **Approval question:** Should fallback prioritize the same mood up to 5 minutes longer, then another mood within budget, with no combined relaxation?
- **Affected:** [#25](https://github.com/xiaodlb/watchnext/issues/25), [#26](https://github.com/xiaodlb/watchnext/issues/26), [#27](https://github.com/xiaodlb/watchnext/issues/27).

### D20. No result

- **Status:** Proposed.

- **Recommendation:** Return an explicit no-match state when exact and permitted fallback sets are empty. Explain whether viewers need progress, the list is empty, or filters exclude known eligible titles; provide relevant actions without silently changing inputs.
- **Rationale:** A near match is useful only when it remains within the agreed relaxation policy.
- **Example:** A lone 90-minute movie with 25 minutes available produces No match and an edit-time/add-title action, not an unexplained 65-minute overrun.
- **Approval question:** Should no match preserve all chosen inputs and offer explicit adjustment actions without automatic filter changes?
- **Affected:** [#24](https://github.com/xiaodlb/watchnext/issues/24), [#25](https://github.com/xiaodlb/watchnext/issues/25), [#26](https://github.com/xiaodlb/watchnext/issues/26).

### D21. Pick again and exhaustion

- **Status:** Proposed.

- **Recommendation:** Keep an ordered candidate list for the current picking context. Advance through all exact matches, or through only the selected fallback tier if no exact matches exist. After its last item, show “All matches shown” with an explicit Start again action; do not repeat automatically. Keep cycle state local to the picking page, not permanent history.
- **Rationale:** Enforce no early repeats and disclose restarts clearly.
- **Example:** Candidates A, B, C show in that order; the next action shows exhaustion, and Start again returns A.
- **Approval question:** Should exhausting a cycle require an explicit Start again action, without mixing fallback tiers into an exact-match cycle?
- **Affected:** [#25](https://github.com/xiaodlb/watchnext/issues/25), [#27](https://github.com/xiaodlb/watchnext/issues/27).

### D22. Reset and invalidation

- **Status:** Proposed.

- **Recommendation:** Changing viewers, time, mood, or rewatch permission discards the old cycle. Revalidate relevant title/progress/contribution state before showing another result; archive/restoration, addition/removal, duration/mood/type/identity edits, or selected-viewer progress changes reset and recompute. Inform the user when list changes reset a cycle. Rating/note changes alone do not reset it. Ignore stale responses and serialize advance actions.
- **Rationale:** Prevent stale spoiler-ineligible results while keeping unrelated feedback out of selection.
- **Example:** After A is shown, B becomes archived; Pick again recomputes without B and shows “List changed; picks refreshed.” Max changing his rating alone preserves the current sequence.
- **Approval question:** Should relevant list/progress changes reset and disclose the cycle refresh, while ratings/notes never affect it?
- **Affected:** [#24](https://github.com/xiaodlb/watchnext/issues/24), [#26](https://github.com/xiaodlb/watchnext/issues/26), [#27](https://github.com/xiaodlb/watchnext/issues/27).

### D23. Manual timestamps

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Accept M:SS or H:MM:SS with valid minute/second components and whole seconds, from 0 through full duration inclusive. Display H:MM:SS for at least one hour and M:SS otherwise. Blank means no timestamp, distinct from zero. Permit correction backward and explicit clearing.
- **Rationale:** Support familiar resume positions without pretending to observe external playback.
- **Example:** 1:10:00 on a 90-minute movie saves as 4200 seconds; 1:99:00, negative input, or 1:30:01 is rejected; clearing displays Not recorded.
- **Approval question:** Should manual timestamp entry use these formats and bounds, with blank distinct from zero?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#21](https://github.com/xiaodlb/watchnext/issues/21).

### D24. Completion and corrections

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Completion is an explicit member action, independent of timestamp. Reaching full duration does not mark complete automatically; marking complete does not rewrite a timestamp. Undo completion preserves the timestamp and the retained episodic position; users then correct progress manually if needed.
- **Rationale:** External viewing is not observed, and guessing completion could incorrectly exclude content.
- **Example:** Saving 1:30:00 on a 90-minute movie leaves it unfinished until Mark complete; Undo complete restores eligibility without changing 1:30:00.
- **Approval question:** Should completion always be explicit and independently reversible without rewriting saved positions?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#20](https://github.com/xiaodlb/watchnext/issues/20), [#21](https://github.com/xiaodlb/watchnext/issues/21), [#24](https://github.com/xiaodlb/watchnext/issues/24).

### D25. Duration edits below stored timestamps

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** Allow a valid duration correction without silently altering personal timestamps. Display existing out-of-range timestamps with a correction warning; newly entered timestamps must satisfy the new duration. Do not use a cross-record constraint that prevents correcting shared metadata. Completion remains unchanged.
- **Rationale:** A contributor's correction should not erase another member's historical input.
- **Example:** A video's duration changes from 90 to 60 minutes while Anna has 70 saved; the detail view preserves 70 with “Beyond current duration—update progress.” Saving a new 70-minute timestamp is rejected.
- **Approval question:** Should duration corrections preserve but flag older out-of-range timestamps instead of truncating or deleting them?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#14](https://github.com/xiaodlb/watchnext/issues/14), [#21](https://github.com/xiaodlb/watchnext/issues/21).

### D26. Missing and series-level viewing links

- **Status:** Delegated decision — bounded resolution adopted in issue #12 under the October 15, 2026 autonomy directive quoted above; not a separate explicit user answer.
- **Delivery boundary:** Missing links, HTTP/HTTPS validation, external/series labeling and no automatic progress changes are implemented by #12. Contributor-only missing-link edit actions remain in [#14](https://github.com/xiaodlb/watchnext/issues/14); no inert edit action is shown. Picker eligibility is implemented by #26, not this detail increment. The rationale/example below are retained.

- **Recommendation:** Permit absent viewing links; show No viewing link saved with an edit action only when the selected member can edit. Accept HTTP/HTTPS destinations only. Label a series-level destination “Open series”; show the suggested episode separately without fabricating an episode-specific URL. Opening externally never changes progress.
- **Rationale:** Metadata/source pages are not guaranteed playable episode destinations.
- **Example:** A manual movie without a link can be picked but has no active Watch button; S2E3 can accompany Open series without claiming the link opens S2E3.
- **Approval question:** Should missing links leave titles pickable and series-level links be labeled without manufactured episode URLs?
- **Affected:** [#12](https://github.com/xiaodlb/watchnext/issues/12), [#19](https://github.com/xiaodlb/watchnext/issues/19), [#26](https://github.com/xiaodlb/watchnext/issues/26).

### D27. Additional saves do not overwrite metadata

- **Status:** Delegated decision — recommendation adopted in issue #4 under the October 15, 2026 directive quoted above; rationale and example below apply.

- **Recommendation:** A duplicate save adds only the contributor. Existing title metadata and all personal history take precedence over a new import. Present changed metadata for explicit contributor editing; never apply it as a side effect of adding a name.
- **Rationale:** Preserve intentional group edits and keep save/merge distinct from edit permission.
- **Example:** Max imports a 23-minute runtime for Anna's existing 22-minute title; the shared entry remains 22 minutes after Max is added, until a contributor explicitly edits it.
- **Approval question:** Should duplicate/import saves preserve all existing shared metadata and require a separate explicit edit for changes?
- **Affected:** [#4](https://github.com/xiaodlb/watchnext/issues/4), [#13](https://github.com/xiaodlb/watchnext/issues/13), [#14](https://github.com/xiaodlb/watchnext/issues/14), [#19](https://github.com/xiaodlb/watchnext/issues/19).

### D28. Stale and archived detail destinations

- **Status:** Delegated decision — bounded resolution adopted in issue #12 under the October 15, 2026 autonomy directive quoted above; not a separate explicit user answer.
- **Delivery boundary:** Group-authorized archived details remain readable with an Archived banner and preserved history in #12. Unknown/deleted/wrong-group IDs share safe unavailable content. [#15](https://github.com/xiaodlb/watchnext/issues/15) completes restore-by-saving through real detail/archive actions, explicit manual confirmation and trusted provider-identity saves, preserving the same identity/history. Final own-contribution removal archives without deletion. The rationale/example below are retained.

- **Recommendation:** A group-authorized archived title retains a readable detail page with an Archived banner and restore-by-saving action. It remains excluded from active list/picks. Unknown IDs show Not found; wrong-group IDs reveal no private title data. A stale active-list click may reach the archived view without pretending it is still active.
- **Rationale:** Preserve readable history while handling links that outlive list membership.
- **Example:** Anna opens a title after Max removes its final contribution and sees Archived with its existing notes, not an active WatchNext recommendation.
- **Approval question:** Should authorized archived-detail links remain readable with a clear banner and restoration action?
- **Affected:** [#12](https://github.com/xiaodlb/watchnext/issues/12), [#15](https://github.com/xiaodlb/watchnext/issues/15).

## Unresolved integration decision

### U01. Exact metadata access and available fields

- **Status:** Unresolved.
- **Question:** Can the documented routes in [metadata-providers.md](metadata-providers.md) be used with the project's actual credentials/allowances, what are the unofficial provider's runtime units and episodic semantics, and what cover-display rights apply?
- **Rationale:** Issue #3 established official YouTube v3 and third-party Kinopoisk API Unofficial documentation, but neither was live-tested. Public documentation does not prove authenticated availability or settle all semantics/rights.
- **Observable example:** If the chosen provider lacks typical episode duration, its lookup result must request manual duration rather than inventing 22 minutes.
- **Affected/blocking:** Research in [#3](https://github.com/xiaodlb/watchnext/issues/3) is complete. [#16](https://github.com/xiaodlb/watchnext/issues/16) defines incomplete/unavailable results; [#17](https://github.com/xiaodlb/watchnext/issues/17) and [#18](https://github.com/xiaodlb/watchnext/issues/18) verify their respective provider routes; [#19](https://github.com/xiaodlb/watchnext/issues/19) handles fallback. Manual entry remains available independently.

## Completion and handoff

The original issue #2 deliverable was the decision record and prerequisite links. Issue #4 subsequently recorded explicit D01/D02 approval and resolved its schema subset through delegated authority. Non-schema feature tasks still record the choices they rely on. Provider research is complete in [metadata-providers.md](metadata-providers.md); U01 remains unresolved only for authenticated access, runtime semantics, and rights checks owned by #17/#18, not for the existence of documented routes. No provider API is claimed live-tested.
