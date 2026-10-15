# WatchNext

An academic web app for choosing something to watch from a shared saved list.

## Requirements

- Node.js 24 LTS, version 24.15.0 or newer within the 24.x release line.
- pnpm 11.25.0, pinned in `package.json`.

## Install and run locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Stop the server with Ctrl+C. The server binds to the local computer only.

## Verification

```sh
pnpm test
pnpm test tests/home.test.tsx
pnpm typecheck
pnpm build
pnpm db:verify
pnpm db:verify:persistence
```

`pnpm test` runs the suite once; `pnpm test:watch` watches for changes. The initial smoke test renders the home page in jsdom and checks its accessible heading; it does not launch a browser or require network access.

To serve a production build locally, run `pnpm build` followed by `pnpm start`, then open http://localhost:3000.

## Current scope

The shared shell now supports creating a named group and receiving a private invitation URL. SQLite migrations and persistent server access are available. Invitation resolution/sessions, profiles, watchlists, and metadata clients remain in later issues; the creation page honestly marks joining as unavailable until its resolver exists. No provider API credentials are needed for current features or database checks.

Before a feature uses persistent storage, run `pnpm db:init`. It initializes/migrates the local user-data database and preserves rows on repeat runs; normal server access requires initialization and never silently creates another file. Set server-only `WATCHNEXT_DATABASE_PATH` in the shell or untracked `.env.local` to override the OS-local default. Relative paths resolve against the working directory; spaces work when quoted. Use a local disk rather than the repository's possibly shared drive. Exact platform paths and lifecycle/error handling are in [the database guide](_docs/database.md).

Invitation links use server-only `WATCHNEXT_APP_ORIGIN`, default `http://127.0.0.1:3000`; set it to the exact origin/port used for your demonstration. It must have no credentials, path, query, or fragment. Loopback links work only on the same computer. See [the server operation guide](_docs/api.md) and optional [.env.example](.env.example). Keep actual invitation links and environment files private.

Run `pnpm db:migrate:temp` to create a temporary database and inspect its tables, or `pnpm db:verify` for synthetic acceptance fixtures with automatic cleanup. Both commands protect normal user databases by accepting no path arguments. See [the database guide](_docs/database.md) for schema details, decision links, exact commands, and recovery behavior.

Dependencies use exact versions in `package.json`, with transitive versions captured in `pnpm-lock.yaml`. Next.js supplies the application framework, React renders the page, and Vitest with React Testing Library and jsdom provides the rendering test. No styling framework or database library has been added.

## Project documents

- [Project scope](_docs/plan.md)
- [GitHub issue index](_docs/tasks.md)
- [Work process](_docs/process.md)
- [Agent instructions](AGENTS.md)
