# Pick again cycles — issue #27

The real `/pick` page now starts at the first current candidate, labels its active action **Pick again**, shows **All matches shown** after the tier's final item, and requires **Start again** to repeat. A one-item tier is item → exhausted; zero uses the existing no-match state with no advance action. Exact, over-budget and different-mood tiers stay separate: exhausting a tier never appends lower fallback or changes inputs. The delivered pure [eligibility](eligibility.md) and [ranking](ranking.md) still own safety, exact runtimes and ordering.

D21/D22 recommendations were adopted under the October 15 delegated-authority source in [plan.md](plan.md), with rationale/examples in [decisions.md](decisions.md), not individually explicit approvals. The bounded implementation choices below avoid a persistent recommendation-history table or new service/dependency.

## Ephemeral page protocol

The client creates a random page ID and holds its cursor only in React memory. Raw cycle fields extend the #26 form: `pageId`, `intentId`, `intent=start|next|restart`, and optional `cursor`. Page/intent identifiers use 1–80 ASCII letters/digits/underscore/hyphen; continuation cursors are opaque 32-byte random base64url values (43 characters). Scalars must be single text values. Request ID remains a separate fresh transport-attempt identifier. Actual UI uses the cycle protocol; the internal no-cycle first-result helper remains compatible with #26 callers and cannot supply an advance index/list.

`cycle.ts` holds at most **512** page records in process memory, evicting the oldest retained page at capacity. Each record has a fixed **30-minute lifetime from its initial accepted start**, not extended by advances/retries. It contains hashed group/session ownership, canonical context/dependency hashes, current index/cursor and only the last accepted logical intent. It contains no saved titles, names, ratings, notes, raw session credential or permanent recommendation history. There is no cycle SQLite table, localStorage, cookie preference or cross-page shared client position.

The session credential hash and actual group bind page ownership; client group is still stale-context detection only. A current opaque cursor is required to advance/restart a retained page. Unknown, expired, evicted, process-lost, wrong-owner/context or tampered continuations return safe `conflict` with no private candidate. The UI hides old links and offers **Start a new cycle**, which deliberately creates a new page ID and asks for a new first result. An existing active page cannot silently submit another ordinary start. A cursor-free initial start is a deliberate new-page request; client reload/unmount loses its former handle, and separate tabs/contexts have independent IDs. Server process/worker restart loses memory and requires explicit conflict recovery for continuations. This fits the supported local single-process academic server; no shared/distributed state is claimed.

Before **every** start/next/restart or same-intent retry, the service reauthorizes session/origin/group/viewers, performs existing expiry maintenance and rebuilds the consistent group snapshot/ranked tier. No client title, order, episode, index or eligible list authorizes selection. Candidate identity is `[stable title ID,item]` or `[stable title ID,episode,numbering style,season,episode]`; it never depends on display text or an inferred next episode. One title contributes only its real #24 target. A new episode requires a genuine saved progress change and disclosed reset, not another click.

## Semantic invalidation

Context hashes use actual group, sorted selected viewer **set**, exact budget seconds, fixed mood and boolean rewatch permission. Viewer reordering is equivalent; changed inputs are a new context. The UI immediately hides/discards the prior result/cursor on an edit and starts a fresh page ID on the next deliberate submission. Group change clears viewers; own active-profile selection is not substituted for chosen viewers.

The semantic fingerprint deterministically includes:

- Current group titles, including archived records: stable ID, displayed/normalized identity, type, duration, numbering, archive state, original creation time, provider namespace/ID and stored source/watch/cover destinations.
- Each title's sorted mood codes and genre key/label values, plus sorted title/member contribution associations.
- Selected members' actual ID/name/color and their saved progress rows: numbering/state/coordinates, independent completion and retained timestamp (including NULL versus recorded zero).
- The chosen tier and complete ordered candidate identities from fresh #24/#25 results.

Ratings/notes are excluded. Nonselected progress and active browser profile do not influence the fingerprint. Provider retrieval/expiry timestamps, cleared markers and provenance refresh-only bookkeeping are excluded when usable values remain unchanged; actual expired/null metadata changes the projected title and invalidates it. Contribution timestamps alone are not identity; creation order uses the original title time.

A changed semantic snapshot resets to the current first candidate with **List changed; picks refreshed.** before its result; if empty, it gives the real current no-match state. That notice survives idempotent retries. Relevant changes therefore cannot return an old unsafe title/link/episode. Nothing silently widens a tier or edits progress to make an item eligible.

## Idempotence and failures

Client submit is serialized synchronously and visibly disabled while pending. Its submitted viewer/time/mood/rewatch announcement identifies the active request; editable controls invalidate late responses. Replies are bound to transport request, current group/input generation and returned page/logical-intent identifiers. Old replies cannot restore links after newer edits/group context.

Each logical advance has an `intentId`; retries after storage/network failure retain that same intent and input cursor, but get a new transport request ID. The server revalidates fresh state, recognizes the last accepted intent and returns the same logical position/current safe model rather than consuming another unseen index. Older replay or the same intent with changed context/cursor/action conflicts safely. A real data change instead returns an explicitly disclosed fresh first result.

The service computes an advance plan without updating the page store, commits its SQLite read/expiry transaction, and only then commits cursor/index state. Failed reads/maintenance therefore consume no position or false exhaustion. JavaScript executes the bounded synchronous operation without an async gap between page planning and commit. Competing distinct intents with the same old cursor yield one accepted advance and a safe conflict; duplicate same intent yields the same result. No persistent cross-worker coordination is promised; a missing worker-local page is a safe conflict, never a guessed index. Error UI retains inputs/retry context while hiding old result links. Choosing/advancing writes no progress, completion, feedback, contributors or archive; only existing mandatory metadata maintenance may clear expired fields/reviews.

## Verification

`pnpm exec vitest run tests/picker/cycle.test.ts tests/picker/cycle-server.test.ts tests/picker/picker.test.tsx --reporter=verbose` exercises named sequence, all-tier exhaustion, explicit restart, coordinate identity, bounded lifetime/eviction, actual saved semantic changes, canonical viewer order, same-session separate pages, own-profile independence, feedback invariance, cursor replay/tamper/session denial, storage retry and UI race/input/context handling. Normal `pnpm test` includes every fixture.

After building, `node tests/fixtures/cycle-browser-check.mjs` uses the same explicit installed Playwright/Edge runtime variables as #26 and the shared isolated production lifecycle. At 375px/1280px, two contexts check A/B/C, one-tier exhaustion/restart, selected-progress versus unrelated feedback, archive/restore/destinations, exact episode identity, both fallback tiers, a response lost **after server processing**, idempotent retry, duplicate submits, held stale advance, tampered cursor, reload/empty state and focus/overflow. Actual cursor values captured through test interception join synthetic invite/session values in log/artifact/database scans. Screenshot inspection uses the optional existing 20-second window; own processes/files are cleaned. `picker-browser-check.mjs` remains a regression for the delivered first-pick/detail/link/expiry/group safety, updated to use unambiguous active-cycle button labels. No live provider or normal user database is used.
