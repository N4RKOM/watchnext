# Synthetic academic demo

From the repository root, with the documented Node/pnpm versions installed:

```sh
pnpm demo:prepare
pnpm demo:prepare --show-invite
```

Preparation explicitly creates/migrates a dedicated tool-owned database, then prints its resolved path, fictional group/member names and exact quoted PowerShell startup commands. Copy those commands into a separate terminal: they set `WATCHNEXT_DATABASE_PATH` and `WATCHNEXT_APP_ORIGIN` for that terminal and run `pnpm dev`, or `pnpm build` then `pnpm start`. Open the private one-off invitation on this computer. It uses the real invitation resolver and token-free group page. Select Anna or Max; these are shared trust-based profiles, not verified accounts. A second private browser context can select the other member. Preparation starts no server and rewrites no environment file.

Default location: `<home>/AppData/Local/WatchNextDemo/owned-v1/demo.sqlite` on Windows; `<home>/Library/Application Support/WatchNextDemo/owned-v1/demo.sqlite` on macOS; `<home>/.local/share/WatchNextDemo/owned-v1/demo.sqlite` on Linux. CLI paths and `WATCHNEXT_DEMO_*` overrides are refused. Normal configured/default storage stays untouched. Setup/reset also refuses a demo destination currently selected as normal app storage: stop the demo server and use a fresh terminal or unset its database override before preparing/resetting. Do not put the demo selection into `.env.local`.

`--show-invite` is explicit private setup output. Each invocation renews the invitation and invalidates previous demo links and sessions; rejoin with the new link. Routine preparation/startup prints no usable invitation. Credentials are fresh random 256-bit values, stored only as hashes; no session cookie is seeded. Keep one-off output private and out of screenshots/Git/reports. Links work on this computer only. Demo origins must use HTTP with `localhost` or `127.0.0.1`, matching the existing local launcher. For another local port, set `WATCHNEXT_APP_ORIGIN` to that exact origin before preparation; printed startup commands include its `--port` argument. HTTPS, other loopback aliases and remote origins are refused by this demo tool.

## Known baseline

Group `demo-group` is **Fictional Friday Watch Club**. Anna (`demo-anna`, blue) and Max (`demo-max`, teal) have separate progress, ratings and multiline notes. Creation order and IDs are stable:

| ID / fictional title | Type / full or typical duration | Moods | Contributors / Anna and Max progress |
| --- | --- | --- | --- |
| `demo-funny-24` / Fictional Funny Film | Movie / 24 min | Funny, Relaxing | Anna + Max; 10:00 / 2:00, unfinished |
| `demo-funny-18` / Fictional Short Sketches | YouTube / 18 min | Funny | Max; 5:00 / 18:00, unfinished |
| `demo-series` / Fictional Space Sitcom | Series / typical 20 min | Exciting | Anna + Max; next S1E3 / S1E7, unfinished |
| `demo-anime` / Fictional Quiet Quest | Anime / typical 23 min | Dark, Relaxing | Max; next episode 5 / 2, unfinished |
| `demo-near` / Fictional Heartfelt Film | Movie / 27 min | Emotional | Anna; 1:00 unfinished / 27:00 completed |
| `demo-archive` / Fictional Archive Keepsake | Movie / 15 min | Funny | Archived, no contributors; 7:00 completed / 0:00 unfinished |

Every title has Anna's 9/10 and Max's 6/10 plus independently attributed multiline fictional notes. Genres include Comedy, Science fiction, Short, Adventure, Animation and Drama. All entries have manual origin and missing covers/watch links, using the app's real fallback artwork and missing-link text. No provider snapshots, keys, metadata requests or playback are involved; there are no expiring imported fields.

## Reproducible screen checks

Start each picker example with fresh settings (a new `/pick` visit suffices). Select viewers explicitly; an active profile is not required to pick.

1. **Anna + Max, 25 minutes, Funny, rewatches off**: Funny Film, full 24 minutes despite saved timestamps. **Pick again** gives Short Sketches, full 18 minutes. Then the exact tier is exhausted; **Start again** is explicit. No fallback tier is silently added.
2. **Anna + Max, 20 minutes, Exciting, rewatches off**: Space Sitcom is excluded because next episodes differ. The actual suggestion is Short Sketches with a different-mood alternative disclosure, not “No match”. Turn rewatches on: Space Sitcom at **Season 1, episode 3**, **Max rewatching**.
3. **Anna + Max, 23 minutes, Dark, rewatches on**: Quiet Quest at **Episode 2**, **Anna rewatching**. This exercises continuous numbering.
4. **Anna only, 25 minutes, Emotional, rewatches off**: Heartfelt Film is the disclosed alternative **2 minutes longer** than available. Keep Max unselected: his completed flag would otherwise exclude it. The time input remains 25.
5. Open Funny Film details as Anna and in the other browser as Max. Ratings/notes show both names/colors; personal progress controls show 10:00 versus 2:00. Selecting another profile changes the personal editor, not saved history. Picks write no progress/feedback, and ratings/notes do not rank picks.
6. Open **Archive**, then Archive Keepsake. Both ratings/notes and independent completion/timestamps remain. As Anna choose **Restore to watchlist**: the same `/watchlist/demo-archive` ID becomes active, with Anna as contributor and unchanged personal history. **Remove my contribution**, then **Confirm removal**, archives it again when nobody remains. Cancellation changes nothing.

## Repeat, reset and failure

Ordinary `pnpm demo:prepare` reports **Already prepared**, duplicates nothing and preserves demonstration edits, including extra groups created in this dedicated database. To restore the entire known baseline, stop its server, unset its database selection in the setup terminal and run:

```sh
pnpm demo:prepare --reset --show-invite
```

Reset is a transaction, not filesystem deletion: it deliberately removes demonstration edits/extra records only in this owned demo database, preserves the migration ledger and restores fixed IDs. Use the newly printed startup commands/link. Seed/reset failure rolls back without success output. Initial schema/ownership initialization can remain after a first seed failure with an unready baseline that retry can populate. Migration failure follows the existing [migration rules](database.md); changed checksums are never accepted. Unexpected/partially initialized unowned files need inspection instead of automatic overwrite.

Before writes the tool checks dedicated path, matching file/database ownership, SQLite application identity and allowed files. It refuses symlinks/reparse points, hardlinks, unrelated databases/files and unsafe overrides. DB/journal/ownership artifacts are Git-ignored. Do not add files inside the owned directory or run setup/reset concurrently with the app. This is not a general database reset command.

## Isolated verification

`pnpm test tests/demo.test.ts` covers readback, actual ranker outcomes, preserved edits, rollback, fresh hash-only invitations/renewal, configured/default/unrelated sentinels, mismatched ownership, overrides and linked destinations. Tests supply an owned OS temporary root and never prepare the real default demo or normal database.

After `pnpm build`, run `node tests/fixtures/demo-browser-check.mjs` with `WATCHNEXT_BROWSER_MODULE` set to an installed Playwright module file and `WATCHNEXT_BROWSER_EXECUTABLE` to an installed browser executable. The production browser fixture uses its own temporary demo root, ordinary invitation joins, two contexts at 375/1280 widths, representative exact/catch-up/near-match/archive/history checks and credential scans of routine output/generated artifacts. It cleans its server/browser/temporary data. Comprehensive journey coverage and the complete setup/backup guide remain #29/#30. Streaming and live-provider verification are not claimed.

Verified October 18, 2026: production smoke passed at both widths, including each profile's distinct timestamp/rating inputs and unchanged histories after picks/restoration; credential scans passed. The ordinary suite passed 63 files / 775 tests, typecheck passed, production build passed with the pre-existing migration filesystem-tracing warning, and all 12 schema checks plus separate-process persistence/isolation passed. Startup-output regression also checks matching custom ports and refusal of unsupported origins. No provider calls or normal/demo-default database access were used in verification.
