# Time/mood ranking — issue #25

`rankCandidates` and its exported readonly types live in `lib/picker/ranking.ts`. This pure operation takes the same authorized fresh snapshot as [eligibility](eligibility.md), extending each title with original `createdAt`, plus `availableMinutes` and exactly one fixed mood code. It calls #24 itself on that same snapshot: caller-supplied eligible flags/IDs/results cannot authorize a candidate. No runtime database, network, provider, clock read, UI, randomness or cycle state is added. #26 must guard the actual session/group and enforce metadata expiry before projecting data.

## Input and validation

Time accepts a numeric integer 1–1440, or canonical decimal text matching `[1-9][0-9]{0,3}` within that bound. No surrounding whitespace, leading zeros, signs, decimals, exponent text, arrays, nonfinite values or coercion. Numeric values already parsed by JavaScript have no retained source spelling (numeric 100 is an integer regardless of its source notation); strings preserve syntax and `1e2` is rejected. Convert once to exact whole seconds. Mood is one exact canonical fixed code, never a label/array or inferred default. Invalid #24 context/viewers/rewatches propagate their existing distinct result; malformed time/mood returns `invalid_ranking` with field and safe message.

All title data and ranking metadata are in one projection array, so no second eligible result can be matched to a stale/different title. Duplicate same-group title IDs return safe `invalid_ranking:titles`, never an arbitrary winner. Each eligible title needs canonical UTC millisecond ISO `createdAt` (`YYYY-MM-DDTHH:mm:ss.sssZ`), round-tripping to the same real instant; invalid/missing values return validation. This is the existing SQLite creation format. Foreign/archived/metadata-incomplete exclusions are retained without requiring creation metadata or exposing foreign data. Snapshot IDs/creation times must come from actual stored entries, never contribution timestamps or edits/restoration.

## One ordered tier

Compare each eligible title's unchanged **full** movie/video runtime or **typical episode** runtime to budget seconds. Timestamps do not reduce it; ratings/notes/nonselected progress have no effect. Any requested code in a multi-mood title matches. Preserve all #24 episode coordinates/style/restart/catch-up and selected rewatching IDs.

1. `exact`: requested mood and duration <= budget. Sort duration descending, original creation instant ascending, stable title ID ascending. IDs use JavaScript ordinal UTF-16 code-unit `<`/`>` comparison, independent of locale; saved UUIDs are ASCII. No input-arrival tie.
2. Only when exact is empty, `over_budget`: same mood, strictly longer than budget by at most 300 seconds inclusive. Sort smallest overrun first, then the same creation/ID ties. Every candidate carries exact `overrunSeconds`, its explicit tier, and readable minutes/seconds disclosure: 1501 seconds against 25 minutes says **1 second longer**; 1561 says **1 minute 1 second longer**. Never round a mismatch into a fit.
3. Only when both earlier tiers are empty, `different_mood`: no requested mood and duration <= unchanged budget. Sort longest first, then creation/ID. Explain requested and actual fixed mood labels (deduplicated in fixed-list order). Never label a title different-mood if it includes the requested code.

Return only the chosen ordered tier. Never mix tiers, permit +301 seconds, relax mood and time together, change the submitted budget/mood/viewers/rewatches, or relax eligibility. D18–D20 were adopted October 17, 2026 under the October 15 delegated-authority quote in [plan.md](plan.md), not individual explicit approvals. Original oldest-first ties make results reproducible, the bounded overrun preserves requested mood first, and explicit no-match avoids invented suggestions. See their rationale/examples in [decisions.md](decisions.md).

## Results and no match

`ranked` returns `tier`, the complete ordered `candidates`, `context` and original safe #24 `eligibility` outcomes. Candidates retain #24 eligible fields plus explicit tier, actual mood codes, overrun seconds and safe explanation. `context` preserves accepted original time representation, exact budget seconds, requested mood, selected viewers (copied) and effective rewatch permission. Input projections remain unchanged. Index is an association reference, never a tie-breaker.

`no_match` preserves the same context/eligibility, with readable generic explanation, stable reason categories and parallel suggested action kinds:

| Reason | Meaning | Suggested action |
|---|---|---|
| no_active_titles | Empty snapshot, or only archived/foreign exclusions | add_title |
| progress_required | Unknown/invalid selected progress blocks | set_progress |
| viewer_ineligible | Completion-off or differing episode positions | review_viewers_or_rewatches |
| metadata_incomplete | Required title/type/runtime/moods/numbering unavailable | complete_metadata |
| time_mood_excluded | Eligible titles exist but no permitted tier matches | adjust_time_or_mood |

Multiple categories are returned in this fixed order when relevant, without copying foreign identifiers or untrusted text into messages. Actions are suggestions, not mutations; viewer input validation remains distinct from no-match. Safe per-title exclusions retain affected selected IDs/coordinates for later useful explanations.

#27 consumes this **single tier**. It must not append fallback candidates to an exact cycle or append the lower fallback tier to an overrun cycle. Exhaustion/reset/no-repeat presentation belongs to #27; #26 owns actual controls/results/actions. No local or persistent cycle state is implemented here. D21/D22 remain for #27.

## Verification

`pnpm exec vitest run tests/picker/ranking.test.ts tests/picker/ranking-saved.test.ts --reporter=verbose` runs named fixtures for exact seconds, all tier boundaries/priorities, ties, input/projection validation, preserved episode targets, no-match reasons and viewer/privacy safety. The ordinary suite includes these tests. `ranking-saved.test.ts` uses isolated migrated in-memory SQLite and real saved/profile/progress/feedback/contribution/edit/archive/restore/freshness services before projecting into the pure module. It verifies original creation survives those operations and no ranking history writes occur. No browser check is claimed for this module without runtime UI/routes.
