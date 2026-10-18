# Testing WatchNext

Use Node.js 24.15+ within 24.x and pnpm 11.25.0. Run checks serially on constrained machines. Tests must use isolated temporary SQLite paths; never call normal `db:init`, reset the real demo, inspect provider secrets or depend on live provider access as verification.

## Layers and commands

- `pnpm test`: the ordinary Vitest unit/service/action/render suite. It discovers only `tests/**/*.test.ts` and `tests/**/*.test.tsx`; browser `.mjs` journeys are separate. Tests cover boundary/truth-table behavior, real SQLite constraints/transactions, guards and meaningful UI state. Preserve existing coverage and assertions.
- `pnpm test tests/demo.test.ts`: one focused file. A `-t` filter intentionally selects cases for debugging; it never substitutes for the final whole suite.
- `pnpm typecheck`: TypeScript validation.
- `pnpm build`: current production compilation/type/static-generation checks. Next's existing two build-worker limit remains; keep builds and browser runs sequential. The known migration filesystem-tracing warning is documented in README.
- `pnpm db:verify` and `pnpm db:verify:persistence`: synthetic migration/constraint and separate-process persistence/isolation checks with automatic owned cleanup.
- `pnpm db:verify:backup`: isolated WAL-aware new-file snapshot/restore, preserved provenance/deadlines/history and real offline expiry checks; see [backup/restore](backup-restore.md).
- `pnpm test:e2e`: current-source production build followed by named serial real browser journeys. It always initializes a fresh owned OS temporary database and chooses an available HTTP loopback port. It runs no normal/demo-default initialization and does not require an already-running server or an existing `.next` build.

## Reproducible browser setup

From a clean checkout, locally:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux CI uses the same runner; install the browser's system dependencies explicitly:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm typecheck
pnpm db:verify
pnpm db:verify:persistence
pnpm test:e2e
```

Provision the pinned Node/pnpm versions before these commands. The browser install is a setup download, not a runtime metadata dependency. Missing Chromium fails clearly with the install command; no skip/pass fallback, hidden absolute runtime path, Edge requirement or global Playwright install is used. The browser suite uses the repository's exact `playwright@1.64.1` dev dependency and its matching Chromium. Under the October 15 delegated dependency authority in [plan.md](plan.md), #29 adopts the Playwright library to consolidate the established serial Node browser harness while retaining explicit privacy-safe output/cleanup. No additional test framework/server/service is required. See official [library](https://playwright.dev/docs/library) and [browser installation](https://playwright.dev/docs/browsers) instructions; update the dependency and installed browser together.

## What the whole journey proves

At 375px and 1280px, separate browser contexts create a real group/invitation, Anna/Max profiles/colors and four manual content types. Duplicate confirmation produces one shared entry. Real UI updates record independent timestamps/episode coordinates/completion, ratings and inert multiline notes. The picker checks full-duration 24-before-18 ordering, no early repeat, explicit exhaustion/restart, both catch-up numbering styles, named rewatchers, actual-progress invalidation, alternate-mood exclusion and disclosed overrun.

Contributor editing/removal, final archive and explicit manual restore preserve the same ID and personal history. Read-only DB queries supplement screen checks; they never insert the business outcome. A second UI-created group checks foreign-ID reads, replay of a captured genuine Next rating action with wrong-group/forged-session credentials, stale-profile forms, unchanged foreign data, and persisted session/title/history across an owned server restart. A pre-restart cycle safely requires a new cycle; it is not durable viewing history. Fresh picker navigation resets page-local choices. Reviews retain their shipped ten-minute, session/group/member-bound DB lifetime; this suite does not invent cross-restart review durability guarantees.

The lookup journey substitutes **only outbound provider fetch** in the owned server's test preload. The actual YouTube/Kinopoisk adapters, normalizer, actions, review handles, provenance and trusted save remain real. Synthetic YouTube editing and explicit ambiguous Kinopoisk candidate selection/manual unknown type/runtime/mood completion reach persisted storage. Quota/network/provider/unconfigured failures preserve manual fields and manual save succeeds. Browser traffic outside the owned app origin is blocked; server fetch allows only the synthetic provider contracts and loopback app origin. No real API key, provider account or paid access is used. This proves mocked integration, not authenticated provider availability, field rights, licensed covers or playback.

## Isolation, privacy and cleanup

Each run owns a random direct OS-temp data directory with initialized `journey.sqlite`, plus a separately owned neighbouring sentinel directory, its browser/contexts and spawned production/build processes. Database assertions open read-only; valid normal-user/separate-demo SQLite sentinels and an unrelated file must remain byte-identical, including after the data directory is removed. Only then does the harness remove its separate sentinel directory. The app receives isolated default-data/home settings as well as its explicit database path, and unexpected fallback storage fails the audit. There is no path override or production bypass endpoint. Cleanup checks resolved containment, rejects linked/aliased roots, closes owned handles/processes and deletes only its owned directories. It never kills by process name. The actual server starts with the existing framework privacy preload; provider keys and invite/session/review credentials stay in private memory and are scanned against captured routine output, generated `.next` artifacts and fixture files.

No screenshots, video, HAR, storage state or Playwright trace is retained; invite-bearing pages are never exported. Safe output names the journey/step and expected/observed condition. Known synthetic credentials, invite paths and owned paths are redacted from failure messages. Do not add `console.log` of headers, action payloads, raw exceptions, page HTML or private links. Signal interruption attempts owned cleanup and exits nonzero. Run one suite/build at a time: the build output directory is shared repository state.

To deliberately prove failure cleanup:

```sh
pnpm test:e2e --inject-failure
pnpm test:e2e
```

The first command **must exit 1**, naming `injected failure cleanup` with `Owned cleanup complete: true`; it is not a passing journey. The next command starts fresh and must pass. Unit lifecycle checks also prove pre-build cleanup/idempotence, rejected unrelated/junction targets and redacted failure context. Never add retry loops that silently rerun a failed journey; fix the named cause and rerun explicitly.

Readiness probes are bounded to 30 seconds with request deadlines, build setup to five minutes, browser actions to 15 seconds/navigation to 20 seconds, and owned process shutdown to ten seconds. Probes wait for readiness, not arbitrary sleeps to hide a failing assertion. If setup fails, install the exact browser/runtime; for a production build failure run `pnpm build` to obtain compiler diagnostics. A port race or crashed process is a real failure: rerun only after understanding/fixing the cause. An assertion failure reports the named UI condition; inspect the relevant app/unit test without exporting bearer-bearing browser state. Do not weaken the guard or replace UI operations with direct fixture inserts.

Older feature-specific `tests/fixtures/*-browser-check.mjs` scripts remain focused optional diagnostics with their individually documented runtime setup. The portable `test:e2e` command is the supported complete journey entry point. Demo fixture smoke is documented in [demo-data.md](demo-data.md). Complete installation/backup/presentation documentation belongs to #30.

## Verification recorded for issue #29

October 18, 2026, Windows/Node 24 with the repository-pinned Playwright and downloaded matching Chromium: whole journeys passed repeatedly from fresh isolation, including after the deliberate nonzero failure with completed cleanup. Both representative widths and all provider mocks/ownership/restart/privacy/sentinel assertions passed. Final ordinary suite: 64 files / 779 tests, no skips; typecheck/build, 12 schema checks and fresh-process persistence passed. The existing build tracing warning remains. Linux CI commands above are the supported setup recipe, not a claim that hosted CI or authenticated provider access was exercised. No product integration defect required an application change.
