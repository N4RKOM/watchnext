# WatchNext

An academic web app for choosing something to watch from your group's saved list. Save movies, series, anime and YouTube videos; keep separate progress/ratings/notes; pick by viewers, full duration and mood. Duplicate saves add names to one entry. Contributor edits, archive/restore, optional metadata review and ordered Pick again are implemented.

## Requirements

- Node.js 24 LTS, version 24.15.0 or newer within the 24.x release line.
- pnpm 11.25.0, pinned in `package.json`.

## Install and run locally

From the repository root:

```powershell
pnpm install --frozen-lockfile
$env:WATCHNEXT_DATABASE_PATH = Join-Path $env:LOCALAPPDATA 'WatchNext\watchnext.sqlite'
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3000'
pnpm db:init
pnpm dev
```

Open **http://127.0.0.1:3000** and keep the terminal running. Stop with Ctrl+C. These PowerShell commands select a local private database explicitly; [the setup guide](_docs/local-setup.md) covers quoted paths with spaces, macOS/Linux, alternate ports, invitations/profiles, optional provider settings and troubleshooting. Match browser/configured origin exactly; do not silently mix localhost and 127.0.0.1.

## Verification

```sh
pnpm test
pnpm test tests/home.test.tsx
pnpm typecheck
pnpm build
pnpm db:verify
pnpm db:verify:persistence
pnpm db:verify:backup
```

`pnpm test` runs the suite once; `pnpm test:watch` watches for changes. The initial smoke test renders the home page in jsdom and checks its accessible heading; it does not launch a browser or require network access.

For complete isolated production-browser journeys, install the pinned browser once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. It builds current source, uses fresh temporary data and synthetic outbound provider responses, and cleans its own processes/data. See [testing guidelines](_docs/testing-guidelines.md) for exact local/CI setup, coverage, privacy and deliberate-failure cleanup verification.

To serve production, stop dev, retain the same database/origin environment, then run `pnpm build` and `pnpm start`. Open http://127.0.0.1:3000. Both supported launchers bind to 127.0.0.1 and install the credential-safe tracing preload; keep them running while using the app. See [the server contract](_docs/api.md).

Builds cap Next page/static worker concurrency at two via `experimental.cpus` in `next.config.mjs`, verified with pinned Next 16.4.1. This retains compilation, TypeScript validation and all static generation. During #16 verification, the default 11-worker build repeatedly exited on Windows with code 3221226505 while host committed memory was about 93%; no application exception was emitted. The same build passed with two workers. This supports a resource-pressure diagnosis, but the generic exit code alone does not establish the exact native failure. Keep verification sequential on constrained machines and recheck this experimental option when upgrading Next. It does not change request-serving concurrency or privacy settings.

## Current scope

The local first release supports real groups/invites, selectable named/colored profiles, shared watchlists/details, all four manual entry types, optional YouTube/third-party Кинопоиск review/save, independent progress/completion/ratings/notes, contributor editing/removal, archive/history/restore, full-duration filtering, catch-up/rewatch eligibility and Pick again with explicit exhaustion/restart. [The dated completion audit](_docs/completion-audit.md) maps every agreed requirement and all 30 issues to implementation and verification. Live issue QA/closure remains authoritative.

Names/invitations are trust-based, without verified accounts. Provider credentials are optional: manual workflows/demo run without them. Configured adapters are tested with synthetic responses; authenticated provider access/quotas/rights are unverified. Кинопоиск is a third-party service with manual runtime and absent covers; retained imported fields follow real refresh/delete deadlines. See [provider/lifecycle limits](_docs/metadata-lifecycle.md). No public hosting, embedded/automatic playback, mixed sessions or preference learning is included.

Before a feature uses persistent storage, run `pnpm db:init`. It initializes/migrates the local user-data database and preserves rows on repeat runs; normal server access requires initialization and never silently creates another file. Set server-only `WATCHNEXT_DATABASE_PATH` in the shell or untracked `.env.local` to override the OS-local default. Relative paths resolve against the working directory; spaces work when quoted. Use a local disk rather than the repository's possibly shared drive. Exact platform paths and lifecycle/error handling are in [the database guide](_docs/database.md).

Invitation links use server-only `WATCHNEXT_APP_ORIGIN`, default `http://127.0.0.1:3000`; set it to the exact origin/port used for your demonstration. It must have no credentials, path, query, or fragment. Loopback links work only on the same computer. See [the server operation guide](_docs/api.md) and optional [.env.example](.env.example). Keep actual invitation links and environment files private.

Use `pnpm dev` / `pnpm start` to serve the app. Their privacy preload suppresses credential-bearing framework request traces before Next initializes; direct unprotected Next startup is rejected. The pinned-runtime hook and upgrade checks are documented in the server operation guide.

Run `pnpm db:migrate:temp` to create a temporary database and inspect its tables, or `pnpm db:verify` for synthetic acceptance fixtures with automatic cleanup. Both commands protect normal user databases by accepting no path arguments. See [the database guide](_docs/database.md) for schema details, decision links, exact commands, and recovery behavior.

Dependencies use exact versions in `package.json`, with transitive versions captured in `pnpm-lock.yaml`. Next.js supplies the application framework, React renders the page, and Vitest with React Testing Library and jsdom provides the rendering test. No styling framework or database library has been added.

Keep backups private and outside Git. Use [the SQLite-safe backup and separate-restore recipe](_docs/backup-restore.md), not a blind copy of a live main file; provenance deadlines remain unchanged and restored files need `pnpm metadata:maintain` before presentation.

## Project documents

For a separate synthetic presentation database, run `pnpm demo:prepare`. See [demo setup and exact scenarios](_docs/demo-data.md) for private invitation output, quoted startup commands and safe repeat/reset behavior. Normal user storage is not initialized or reset by this command.

- [Project scope](_docs/plan.md)
- [Local setup and troubleshooting](_docs/local-setup.md)
- [Backup and restore](_docs/backup-restore.md)
- [Requirement and verification audit](_docs/completion-audit.md)
- [GitHub issue index](_docs/tasks.md)
- [Work process](_docs/process.md)
- [Agent instructions](AGENTS.md)
