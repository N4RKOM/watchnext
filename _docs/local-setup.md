# Run WatchNext on your computer

WatchNext helps your group choose from its own saved list. The local first release includes invitations, named/colored profiles, one shared attributed watchlist, manual/optional lookup entry, independent progress/completion, group-visible ratings/notes, contributor editing, archive/restore and the single-item picker with Pick again. It opens saved external links; it does not play or automatically track a video.

Use **Node.js 24.15.0 or newer in 24.x** and **pnpm 11.25.0**. Versions are pinned in `package.json`; install the committed lockfile rather than updating packages during setup. Git and a local writable disk are needed. Keep database/backups outside the checkout, network shares and cloud-sync folders.

## Install, initialize, start — PowerShell

After obtaining the repository, open a terminal in its root. These Windows commands select the usual local user-data file explicitly and keep one exact origin throughout:

```powershell
pnpm install --frozen-lockfile
$env:WATCHNEXT_DATABASE_PATH = Join-Path $env:LOCALAPPDATA 'WatchNext\watchnext.sqlite'
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3000'
pnpm db:init
pnpm dev
```

Open **http://127.0.0.1:3000**. Keep the terminal running; stop it with **Ctrl+C**. `db:init` explicitly creates/migrates only the selected file. Repeating it preserves rows; run it again after pulling new migrations. Opening the app never silently creates/migrates missing normal storage. Never use normal initialization as a test command.

PowerShell's quoted strings support spaces. To deliberately choose another private local file instead, set the override **before** initialization/start, for example:

```powershell
$env:WATCHNEXT_DATABASE_PATH = Join-Path $env:LOCALAPPDATA 'WatchNext Academic\my watchlist.sqlite'
```

Do not change databases while a server is running. Stop it first, select the intended file, initialize if needed and restart. Switching paths does not move/merge old data. See [database paths and migrations](database.md).

On macOS/Linux use the same commands with shell assignments. This example deliberately selects a quoted local home path rather than relying on OS defaults:

```sh
pnpm install --frozen-lockfile
export WATCHNEXT_DATABASE_PATH="$HOME/WatchNext Local/watchnext.sqlite"
export WATCHNEXT_APP_ORIGIN='http://127.0.0.1:3000'
pnpm db:init
pnpm dev
```

These are portable setup instructions; the recorded walkthrough was executed on Windows. [Verification evidence](completion-audit.md) distinguishes tested environments from instructions.

## Serve a production build

Stop the development server first. In the same configured terminal, retaining the **same database and origin**:

```powershell
pnpm build
pnpm start
```

Open http://127.0.0.1:3000 again and keep the server running. Always use `pnpm dev`/`pnpm start`: their preload configures credential-safe framework tracing before Next starts. Direct unprotected `next dev/start` is rejected. Build, unit and browser verification should run serially; do not run dev and a production build simultaneously.

For an occupied default port, choose a fixed alternate port consistently:

```powershell
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3100'
pnpm dev --port 3100
# Or, after stopping dev and building:
pnpm start --port 3100
```

Open **http://127.0.0.1:3100** and use invitation links produced for that origin. The launchers bind to **127.0.0.1**, not the LAN/public internet. `localhost` may resolve to this computer, but it is a different origin: if deliberately using it, configure `http://localhost:<same-port>` and use that spelling everywhere. Do not mix aliases/ports for strict origin-checked mutations. Link construction uses configured origin, not untrusted request headers. Public hosting is outside this release; this setup is not a remote sharing service.

## First group and everyday use

1. Create a group on the home page. Copy its private invitation from the explicit success field; opening it establishes the group session and moves to the token-free group page.
2. Create/select a named colored profile. A second private browser context can open the same invitation and select another name. Anyone with the link can select any profile: this is trust-based access, not verified identity or accounts.
3. Add a title manually, choosing type, full movie/video duration or typical episode duration, moods and optional genres/link. Series/anime need seasonal or continuous numbering. Save the same manual title in another profile and explicitly confirm to add a contributor to the same entry.
4. Use details to update your own next episode/timestamp, independent completion, rating and note. Feedback is visible to the group. Contributors can edit shared metadata; removing the final contribution archives rather than deletes history. Saving/restoring returns the same ID.
5. On Pick for me, explicitly choose viewers/time/mood; rewatches start off. Picks use the **full** runtime, ignoring saved timestamps. Unknown unfinished episodic progress blocks that series. Rewatches allow least-advanced catch-up with named rewatchers. Alternatives disclose their mismatch. Pick again stays within the selected tier, then offers explicit Start again.

Profiles and selected viewers are separate. Reload/new picker navigation discards page-local choices; process-memory cycle cursors can expire or require restart after server restart. Review handles are short-lived and session/group/profile-bound: rerun lookup when invalid/expired. Restoring a database does not prove personal identity or revoke every historical browser credential. Recheck access and retain invitation links privately; the DB stores hashes and cannot reconstruct raw links. See [server/access contract](api.md).

## Optional provider setup

Manual use, existing saved data, picker, progress/feedback and [synthetic demo](demo-data.md) need no provider key. For authorized optional lookup, set server-only `YOUTUBE_API_KEY` (official YouTube Data API v3) and/or `KINOPOISK_UNOFFICIAL_API_KEY` (third-party Kinopoisk API Unofficial). `.env.example` contains placeholders only; an optional untracked `.env.local` may hold real values. Never use `NEXT_PUBLIC_`, commit keys, print them or ask someone to share secrets in an issue. Restart the server after deliberate configuration changes. This guide does not register accounts or purchase services.

Configured adapters and review/save are implemented and tested with synthetic outbound responses. Actual authenticated availability, account quotas/terms and image rights were **not live verified**. Кинопоиск is not an official API partnership: runtime/type uncertainty requires explicit completion, covers remain absent, and local academic text snapshots use the disclosed app-chosen 30-day refresh/delete policy. YouTube acquired fields have trusted retrieval/deadline provenance and a 30-calendar-day refresh/delete obligation. Corrections/history remain independently authored. Lookup failure keeps manual fields and manual save available. These are metadata links/suggestions, not unrestricted free streaming access. [Provider research](metadata-providers.md), [implemented lifecycle and stopped-app limits](metadata-lifecycle.md).

Run offline maintenance on the **selected initialized file** before showing restored/old data:

```powershell
pnpm metadata:maintain
```

This performs no provider lookup and does not renew deadlines. The running app enforces expiry on startup/reuse/reads and bounded timers; no external scheduler runs while the app/computer is stopped. Preserve deadlines in backups and manage private retained copies accordingly; see [backup and restore](backup-restore.md).

## Check the installation

After stopping dev, use the serial [testing commands](testing-guidelines.md):

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm db:verify
pnpm db:verify:persistence
pnpm db:verify:backup
pnpm exec playwright install chromium
pnpm test:e2e
```

The ordinary suite, storage checks and E2E runner use their own temporary data, not the normal selected file. Browser install is a one-time setup download; Linux CI uses `pnpm exec playwright install --with-deps chromium`. E2E always builds current source and mocks outbound metadata only. Missing browser is a setup failure, never a skipped pass. [Demo setup/scenarios](demo-data.md) and [dated completion/verification audit](completion-audit.md) provide presentation evidence.

## Troubleshooting

| Symptom | Safe next step |
| --- | --- |
| Port occupied | Stop only your own earlier server, or choose a fixed alternate port and update origin/browser URL together. Do not kill processes by name. |
| Group/mutation unavailable | Use a valid private invitation, select the intended profile and match exact configured origin/port. Reload stale forms after a profile/group change. |
| Missing database / needs initialization | Stop server; confirm the exact path, then run `pnpm db:init` in the same configured terminal. Do not reset/delete a file to hide the error. |
| Read-only/unwritable path | Check local directory/file permissions and disk space. Use owned local storage; avoid network/cloud-sync folders. Do not silently switch to a new file. |
| Pending migrations | Back up with the matching source revision before upgrading; stop writers, then run current `pnpm db:init`. |
| Migration checksum/history mismatch | Restore the correct committed migration files/revision; never edit the ledger or rewrite applied SQL. Inspect a separate backup copy first. |
| Busy/locked database | Stop every server/maintenance writer for that file, then retry deliberately. The five-second busy timeout is bounded; do not delete WAL/journal files. |
| Wrong host/localhost spelling | Use 127.0.0.1 consistently with the default configured origin; aliases and ports are distinct origins. |
| Missing Chromium | Run the pinned Playwright browser install above, with system dependencies on Linux. No external runtime path is needed. |
| Memory pressure during checks | Close your own server/browser and run checks serially. Next caps build workers at two; Vitest has no committed cap. `pnpm test --maxWorkers 2` is an optional low-memory diagnostic, not a reduced suite. Keep ordinary `pnpm test` as the final canonical check and recheck Next's experimental cap when upgrading. |
| No provider key / quota/network failure | Continue with manual entry. Configure only your own authorized server-side keys if needed; no purchase or live availability is promised. |
| Metadata unavailable / old backup | Run maintenance before use. Refresh through a configured provider or supply genuine contributor corrections; copying/restarting does not refresh deadlines. History remains preserved. |
| Lost invitation | Hashes cannot recover the raw link. Keep the originally displayed link privately; the demo's explicit show-invite renews its synthetic link/sessions. No general invitation-recovery UI is claimed. |
