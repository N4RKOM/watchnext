# SQLite schema and migrations

Issues: [#4](https://github.com/xiaodlb/watchnext/issues/4) supplies the schema; [#5](https://github.com/xiaodlb/watchnext/issues/5) supplies persistent local access. The foundation uses Node.js **24.15+ within 24.x**, TypeScript, built-in **`node:sqlite` / `DatabaseSync`**, and ordered SQL migrations. No ORM, driver, or dependency was added. Synchronous access suits this small local academic app; connections use a bounded five-second busy timeout. Node 24 strips the source TypeScript directly for CLI use. [Node SQLite documentation](https://nodejs.org/api/sqlite.html)

## Decisions and scope

Read [the schema-affecting decision gate](decisions.md#schema-affecting-approval-gate) and D01–D17, D23–D25, D27. D01/D02 are explicitly user-approved. The remaining entries were resolved as **delegated decisions** on October 15, 2026 under the directive quoted in [the plan](plan.md), adopting their recorded recommendations/rationale. They are not presented as separate explicit answers.

In particular, D08/D09 define manual/provider identities; D03 defines stored position as **next to watch**; D04–D07 define unknown progress, numbering bounds, transitions, and completed-series rewatches; D11–D13 define one title-level rating/note per member; D14 defines group-unique normalized names. D17 uses whole seconds, and D23–D25 separate manual timestamp from completion while retaining old timestamps when duration is corrected.

These foundations do not implement sessions, edit authorization, duplicate-confirmation UI, progress controls, automatic archive/restore, providers, or a picker. Non-schema D18–D22, D26, and D28 remain for their owning tasks. [Provider research](metadata-providers.md) establishes documented routes, not authenticated access. Imported-data provenance/refresh fields may be added by a later migration when [#16–#19](https://github.com/xiaodlb/watchnext/issues/16) implement retention and provider handling; no data is imported here.

## Normal persistent database setup

Run this **explicit setup command** before the app first needs database access, and again after pulling new migrations:

```text
pnpm db:init
```

It creates the parent directory and database if missing, applies committed migrations through `db/migrate.ts`, closes the setup connection, and prints the selected path/applied versions. Repeating it preserves existing user rows. It never seeds, resets, deletes, or silently switches databases. Normal access requires an initialized current schema and does **not** automatically migrate or create a missing database; it reports `run pnpm db:init` instead. Initialization is the only normal command that creates/migrates a file.

The server-only environment variable is **`WATCHNEXT_DATABASE_PATH`**. An unset variable uses the stable OS-user-data default:

| OS | Default file |
| --- | --- |
| Windows | `%LOCALAPPDATA%\WatchNext\watchnext.sqlite`; if LOCALAPPDATA is unset, `<home>\AppData\Local\WatchNext\watchnext.sqlite` |
| macOS | `<home>/Library/Application Support/WatchNext/watchnext.sqlite` |
| Linux/other | `$XDG_DATA_HOME/WatchNext/watchnext.sqlite` when set, otherwise `<home>/.local/share/WatchNext/watchnext.sqlite` |

The local-user-data base must be absolute. An override may be an absolute filename or a relative filename resolved against the **process working directory**; launch commands from the repository root for consistent relative paths. Spaces are supported and should be quoted by the shell. Blank/whitespace-only values, NUL, `:memory:`, SQLite `file:` URIs, directory destinations, and inaccessible/unwritable paths fail clearly without falling back. Use a dedicated file owned by the current user; errors include the chosen path on the server to help diagnose setup/permissions.

Example PowerShell override for a **local** drive:

```powershell
$env:WATCHNEXT_DATABASE_PATH = 'C:\Users\your-name\AppData\Local\WatchNext Demo\watchnext.sqlite'
pnpm db:init
pnpm dev
```

Alternatively put `WATCHNEXT_DATABASE_PATH="C:/Users/your-name/AppData/Local/WatchNext Demo/watchnext.sqlite"` in untracked `.env.local`. The initialization command loads `.env.local` with Node's built-in environment-file option; Next loads it for dev/start. Shell environment values take precedence. Do not use `NEXT_PUBLIC_` for configuration. Remove the override to use the default; this does not move or merge data.

Use reliable local storage, **not a shared/network drive or a cloud-sync folder**. The repository may be on `M:`, but the default deliberately follows local user storage instead of that repository location. SQLite locking and journals depend on filesystem behavior; an override to a network location is an operator choice, not a supported sharing solution. Keep database, journal, `.env.local`, and generated outputs out of Git.

## Shared server entry and connection lifecycle

Next server components/actions import **`getDatabase` and `closeDatabase` from `db/server.ts`**. Its `import "server-only"` marker produces a clear framework build error if imported from a Client Component. The Node-only connection core also rejects browser execution and imports native Node filesystem/SQLite APIs. Paths and the driver are never passed as client props or imported through UI utilities. Next supplies the server-only marker internally, so no package was added. [Next server-only boundary](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)

Standalone Node setup/check scripts use `db/connection.ts`, the same connection/configuration implementation behind that wrapper. `getDatabase(environment?)` resolves configuration, opens only an existing writable file, enables foreign keys and a 5000ms busy timeout, verifies committed migration history **without writing it**, and caches one connection per process through `globalThis` so development module reloads reuse it. A changed path while open throws; call `closeDatabase()` before switching. Do not close after every request. A process exit releases its handles; an explicit server shutdown hook or tests should call `closeDatabase()`, which safely closes/resets even when called repeatedly. Do not pass per-request untrusted environment/path values to this interface.

The setup function `initializeDatabase(environment?)` creates/migrates a file using its own connection and always closes it. A corrupt database, read-only file, permission error, pending schema, or invalid history is surfaced; no catch creates a replacement database. The five-second timeout bounds lock waits rather than retrying forever. This is one local process connection, not a distributed pool or concurrent-write retry framework.

## Verify persistence without touching normal user data

```text
pnpm db:verify:persistence
```

This command accepts no database arguments and always creates its own `watchnext-persistence-*` directory under the OS temporary directory. It overrides configuration for three separate Node processes through the shared `db/connection.ts` entry: one initializes/writes `Unchanged restart example`, a fresh one reads the unchanged record, and another initializes an independent file and confirms the record is absent. It prints three `PASS` results and an isolation summary, exits nonzero on failure, and removes only its verified temporary directory. The worker refuses to run without an explicit fixture path under that directory. It never uses the normal configured/default database or reads a `.env.local` file.

`tests/db/persistence.test.ts` also exercises close/reopen, repeat initialization, connection reuse/close/reset, foreign keys/timeout, default paths using an isolated user-data base, alternate paths with spaces, relative-path rules, explicit initialization requirements, corrupt destinations, and invalid/unwritable paths. `tests/db/server-boundary.test.ts` creates an isolated minimal Next fixture and confirms a client import fails with the server-only boundary message. It uses Webpack because the temporary dependency junction is outside Turbopack's filesystem root; the normal app still builds with its existing Turbopack setup. All fixture directories are checked before recursive cleanup.

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
| `group_sessions` | SHA-256 session hash primary key, group ID, backing invitation ID, nullable active member ID, UTC creation time | Added by immutable `0002_group_sessions.sql`; composite foreign keys ensure invitation/member belong to the session group. No raw cookie/invite credentials stored. |

Identifiers are stable across archive and restore. `archived = 1` means excluded from the active list/picker by future queries; `0` means active. Updating this flag has no side effects. There are no contributor-removal/archive automation triggers and no cascade deletion of personal history. Future workflows in #15 must update archive state transactionally while preserving IDs and history.

Issue #8 adds only the sessions migration and an invitation ID/group unique index. Re-run `pnpm db:init` to apply it to an existing local database. Session validity is checked against the current invitation revocation state on every access; browser cookie lifetime and server invalidation policy are documented in [api.md](api.md). Session rows do not supply verified personal identity and are not profile records.

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

There are no down migrations, migration framework, or automatic destructive resets. Issue #5's explicit initializer and read-only normal-access check reuse this mechanism; operational backup/restore remains in #30. The repository ignores `.db`, `.sqlite`, `.sqlite3`, their sidecars, environment files, and logs; no database or usable credential is committed.
