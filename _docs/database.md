# SQLite schema and migrations

Issue: [#4](https://github.com/xiaodlb/watchnext/issues/4). The foundation uses Node.js **24.15+ within 24.x**, TypeScript, built-in **`node:sqlite` / `DatabaseSync`**, and one ordered SQL migration. No ORM, driver, or dependency was added. Synchronous local access is sufficient for this academic app's initial schema verification; request-time connection lifecycle and contention handling belong to [#5](https://github.com/xiaodlb/watchnext/issues/5). `db/migrate.ts` uses syntax that Node 24 can strip directly, without a TypeScript runtime package. [Node SQLite documentation](https://nodejs.org/api/sqlite.html)

## Decisions and scope

Read [the schema-affecting decision gate](decisions.md#schema-affecting-approval-gate) and D01–D17, D23–D25, D27. D01/D02 are explicitly user-approved. The remaining entries were resolved as **delegated decisions** on October 15, 2026 under the directive quoted in [the plan](plan.md), adopting their recorded recommendations/rationale. They are not presented as separate explicit answers.

In particular, D08/D09 define manual/provider identities; D03 defines stored position as **next to watch**; D04–D07 define unknown progress, numbering bounds, transitions, and completed-series rewatches; D11–D13 define one title-level rating/note per member; D14 defines group-unique normalized names. D17 uses whole seconds, and D23–D25 separate manual timestamp from completion while retaining old timestamps when duration is corrected.

This issue supplies storage and isolated verification only. It does not implement sessions, edit authorization, duplicate-confirmation UI, progress controls, automatic archive/restore, providers, or a picker. Non-schema D18–D22, D26, and D28 remain for their owning tasks. [Provider research](metadata-providers.md) establishes documented routes, not authenticated access. Imported-data provenance/refresh fields may be added by a later migration when [#16–#19](https://github.com/xiaodlb/watchnext/issues/16) implement retention and provider handling; no data is imported here.

## Run from the repository root

Install dependencies using the existing lockfile if needed:

```text
pnpm install --frozen-lockfile
```

Create a new isolated database, apply migrations, and print its absolute path and table names:

```text
pnpm db:migrate:temp
```

This command always creates a fresh `watchnext-schema-*` directory under the OS temporary directory, with `schema.sqlite` inside. It deliberately accepts **no database-path arguments** and does not read a normal database environment variable. The printed database is retained for inspection. It contains schema and fixed mood definitions, no member fixtures, personal information, or usable invitation credentials. Remove that named temporary directory when inspection is finished.

Run the complete migration/constraint acceptance fixtures in another fresh temporary database:

```text
pnpm db:verify
```

Expected result: twelve named `PASS` lines followed by a summary; a failed assertion prints `FAIL` and exits nonzero. The fixture database and its empty temporary directory are removed when finished, including on failure. The command rejects extra arguments, never accepts a normal data path, and never touches user databases. All fixture names/IDs/notes are synthetic; the invitation fixture is an unusable example hash.

Run the regular suite, including these same fixtures plus migration failure/retry/history tests:

```text
pnpm test
pnpm test tests/db/schema.test.ts
pnpm typecheck
pnpm build
```

The fixtures validate reads as well as rejected writes, including the four content types, multiple moods, independent member histories, provider scope, cross-group/orphan associations, bounds, archive identity/history, and repeat migration. Migration tests also verify atomic rollback, safe retry, immutable checksums, and invalid version history.

## Data dictionary

All tables use SQLite `STRICT` typing. Integer storage rejects fractional values that cannot be losslessly converted. Foreign keys are explicitly enabled for each migration connection; future app connections must do the same. [STRICT tables](https://www.sqlite.org/stricttables.html), [foreign-key requirements](https://www.sqlite.org/foreignkeys.html)

| Table | Keys and stored data | Important invariants |
| --- | --- | --- |
| `schema_migrations` | Four-digit version primary key, filename, SHA-256 checksum, UTC application time | Applied files are immutable; only the next ordered prefix may be applied. |
| `groups` | Text ID, display name, UTC creation time | Display name 1–80 trimmed characters; IDs are caller-generated opaque IDs. |
| `invitations` | Text ID, group ID, unique token hash, optional revocation timestamp, UTC creation time | Store a cryptographic hash of an eventual high-entropy bearer token, never its plaintext. Token generation/rotation/resolution is #7/#8. |
| `members` | Text ID, group ID, display name, normalized `name_key`, avatar hex color, UTC creation time | Name 1–40 Unicode code points; unique `(group_id, name_key)`; a name may exist in another group. Palette selection is a UI/server responsibility. |
| `titles` | Text ID, group ID, display title/key, type, duration seconds, numbering style, nullable provider namespace/ID, source/watch/cover URLs, archive flag, UTC creation time | Types `movie`, `series`, `anime`, `youtube`; duration integer 1–86400; `none` numbering for movies/videos, `season_episode` or `continuous` for series/anime. Provider pair both present or both absent. |
| `title_genres` | Title ID, normalized genre key, display label | Unique title/key; at most ten labels, each 1–40 code points; optional. |
| `moods` | Fixed code and display label | Seeded Funny, Relaxing, Exciting, Dark, Emotional; custom codes rejected. |
| `title_moods` | Title ID + mood code primary key | Several distinct moods per title; foreign keys reject unknown titles/moods. |
| `contributors` | Group ID, title/member composite primary key, UTC save time | Only same-group associations; repeated contribution rejected. |
| `progress` | Group ID, title/member composite primary key, numbering style, position state, optional next season/episode/timestamp, independent completion boolean | Same-group member/title and matching numbering style required. See state rules below. |
| `ratings` | Group ID, title/member composite primary key, integer score | Same group; 1–10 only; clearing deletes a row rather than storing zero. |
| `notes` | Group ID, title/member composite primary key, plain-text body | Same group; 1–2000 Unicode code points; clearing deletes a row. Embedded NUL is rejected so SQLite length cannot undercount text. |

Identifiers are stable across archive and restore. `archived = 1` means excluded from the active list/picker by future queries; `0` means active. Updating this flag has no side effects. There are no contributor-removal/archive automation triggers and no cascade deletion of personal history. Future workflows in #15 must update archive state transactionally while preserving IDs and history.

Composite foreign keys reference `(title_id, group_id)` and `(member_id, group_id)` in every contributor/progress/feedback table. Progress also references the title's numbering style. Consequently a valid member ID from the wrong group fails even when both records exist. This provides data consistency, not request authorization or proof of a profile's identity.

## Identity and validation boundaries

Callers must produce keys using Unicode NFKC normalization, outer trimming, collapse of internal whitespace, and locale-independent lowercasing as specified in D08/D14. SQLite's built-in NOCASE is insufficient for this Unicode contract. Display casing stays separate from the key. This task does not implement form parsing or normalization services; later writes must normalize on the server and must never accept caller-supplied keys blindly.

Titles have unique `(group_id, content_type, title_key)` keys, including archived entries. Manual matching therefore requires confirmation or a distinguishable title such as a year suffix, rather than silent history merging. Known provider identities are unique by `(group_id, provider_namespace, provider_id)`, including archived entries. Different providers and groups may share an external identifier; many manual entries can have NULL provider fields. A duplicate import must add a contributor rather than overwrite metadata (D27), implemented in #13/#19.

The schema validates structural bounds, group consistency, and identity uniqueness. Features must also enforce semantic validation: keys are normalized, at least one mood is present when committing a title, colors come from the UI palette, labels/notes are trimmed, and links are safe HTTP/HTTPS values. A title and its moods are created in one application transaction; requiring a mood via an immediate row trigger would prevent inserting the parent before its children. These feature checks remain in their owning issues and are not claimed as SQL constraints here.

History-sensitive content type/numbering changes are blocked by a trigger once progress, ratings, or notes exist, preserving member meaning (D10). Ordinary metadata corrections leave history untouched. Identity edits still need collision handling and confirmation at the application layer.

## Progress and time representation

- Whole-second `duration_seconds` is the full movie/video runtime or one typical episode runtime. There is no episode catalog or per-episode runtime table. Picker matching does not subtract personal timestamps.
- `position_state = unknown` on episodic content has NULL episode/season. No progress row also means unknown episodic progress; neither fabricates episode 1. For movies/videos an absent row means not marked completed with no timestamp.
- `not_started` on episodic content explicitly stores episode 1, and season 1 for season/episode numbering. `in_progress` stores the next positive episode, with a positive season only for season/episode mode. Coordinates are integer 1–9999. The schema never infers season lengths.
- `none` numbering forbids episode coordinates; episodic styles forbid timestamps. A composite foreign key rejects a progress style different from its title.
- `completed` is a separate 0/1 flag. An episode position can be retained while completed; rewatch suggestions and explicit completion/undo controls belong to later tasks.
- Movie/video timestamp is NULL for not recorded, or an integer from zero through the current full duration. Insert/update triggers reject newly submitted out-of-range timestamps. A shared duration correction can leave an older saved timestamp above the new duration without deleting it; later UI must warn and permit correction/clearing. Updating completion alone does not revalidate or erase that historical timestamp. No timestamp automatically changes completion.

## Migration contract and recovery

`db/migrate.ts` reads `db/migrations/NNNN_name.sql` lexically, rejects duplicate versions, enables foreign keys, and sets a five-second busy timeout. A `schema_migrations` ledger records version, filename, checksum, and application time. Checksums normalize CRLF to LF so Windows checkout line endings do not invalidate an unchanged migration.

Every pending migration and its ledger record run inside one `BEGIN IMMEDIATE` batch transaction. A failed SQL statement or history check rolls back the batch. The empty ledger table may exist after a first failed attempt, but none of the new schema/data/versions survive. Correct the unapplied file and retry. Already-applied files must never be rewritten; add a new numbered migration instead. Missing, changed, or reordered applied history causes a clear failure rather than reapplication. Repeat migration with unchanged files returns an empty list and preserves all fixtures.

There are no down migrations, migration framework, automatic destructive resets, or production data-path selection. Normal initialization, persistent location, connection lifetime, and operational backups belong to #5/#30. The repository ignores `.db`, `.sqlite`, `.sqlite3`, their sidecars, environment files, and logs; no database or usable credential is committed.
