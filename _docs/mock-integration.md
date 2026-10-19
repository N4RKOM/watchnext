# Mock frontend integration and phase-one evidence — issue #61

Status: **PM-groomed. Engineering starts only after [#60](https://github.com/xiaodlb/watchnext/issues/60) has an independent QA PASS.** [#61](https://github.com/xiaodlb/watchnext/issues/61) owns no new domain feature. It integrates and verifies the accepted increments #42 and #55–#60 against all 40 domain rows and the six U groups in the [operation inventory](operation-inventory.md), records the evidence, and hands the typed contract to [#43](https://github.com/xiaodlb/watchnext/issues/43).

Read first: [mock frontend](mock-frontend.md), [mock accounts](mock-accounts.md), [mock groups](mock-groups.md), [mock library](mock-library.md), [mock entry](mock-entry.md), [mock personal](mock-personal.md), [mock picker](mock-picker.md), [design references](design-references.md), [submission matrix](submission-matrix.md), [iteration log](iteration-log.md), [design system](design-system.md) and [testing guidelines](testing-guidelines.md).

Everything below is an **engineering default chosen under the user's delegated authority** (see [plan](plan.md)). None of it is a new user answer. Accepted domain behavior from #55–#60 decides wherever this page seems to differ; a real difference is an integration defect to fix, not a new rule.

## What the integration must prove

1. **Complete coverage.** Every inventory row and U group reaches a real control in `/mock` that calls a typed method on the one mounted service. Every service method is used. Nothing falls through to a production route, Server Action, database or provider.
2. **One connected product.** A single service instance carries records across all domains. IDs stay stable across library, detail, Mine, archive, personal history, picker and group membership. Stale, cancelled and failed requests write nothing in any domain.
3. **Isolation and production default.** `/mock` is the only selector. Normal routes stay production, including with forged query parameters. No real cookie, provider key, native database, live network or normal data is touched.
4. **Evidence that someone can check.** Full serial test runs, two-width browser walkthrough, a small committed set of synthetic screenshots that QA actually opens, updated living documents and a typed handoff for #43.

## Exact defaults

### Launch, reset and lifetime (to verify and document, not change)

- **Selector:** the path `/mock` is the only mock entry. There is no mode environment variable and no production query switch. Optional `?mode=mock` and `?scenario=ready|slow|unavailable` are accepted only on `/mock`; anything else on `/mock` shows the unsupported-selection error.
- **Production default:** `pnpm dev`, `pnpm build` and `pnpm start` serve the real app at `/`. `/mock` exists alongside it and never changes another route.
- **Production-default probe:** the browser run loads `/`, `/watchlist`, `/watchlist?filter=mine`, `/archive`, `/watchlist/add`, `/pick`, `/group`, `/account`, `/login`, `/register` and `/recover`, each plain and with `?mode=mock&scenario=slow&member=friday-owner` added (joined with `&` where a query exists). The forged version must render the same main text as the plain one and no synthetic content. `/mock?mode=http` must show the unsupported-selection error. After the whole run: zero cookies, no `Set-Cookie` response, empty provider keys, the configured database path still absent, no external request, byte-identical sentinels.
- **Lifetime:** state belongs to the mounted `/mock` page's service instance. Reload or a new tab creates a fresh instance at revision 0 with the seeds. Nothing is written to cookies, localStorage, sessionStorage, IndexedDB, files or a backend.
- **Reset demo:** restores this instance's seeds (accounts, groups, library, personal records, picker cycles, metadata clock), clears private disclosures and invalidates captured identities. It never resets another tab, the academic demo database, the normal database or production.
- **Launch commands:** `_docs/mock-frontend.md` currently gives PowerShell only. #61 adds the POSIX shell equivalent and actually runs both the dev and the production launcher once, recording the result:

  ```sh
  pnpm install --frozen-lockfile
  previewDir="$(mktemp -d)"
  export WATCHNEXT_DATABASE_PATH="$previewDir/unused.sqlite"
  export WATCHNEXT_APP_ORIGIN="http://127.0.0.1:3100"
  export YOUTUBE_API_KEY="" KINOPOISK_UNOFFICIAL_API_KEY=""
  pnpm dev --port 3100            # or: pnpm build && pnpm start --port 3100
  ```

  Verified means: `/mock` returns HTTP 200 and renders the synthetic notice, `/` renders the real entry, `unused.sqlite` still does not exist after use, and the server is stopped with Ctrl+C. Never run `pnpm db:init` for the preview.

### Allowed production-path footprint

Relative to tag `graded-baseline-2026-10-19`, the only accepted changes outside `_docs/`, `frontend/`, `app/mock/`, `tests/frontend/` and `tests/fixtures/mock-*` are: `AGENTS.md`, `README.md`, `app/components/navigation.tsx` (the #42 path-scoped branch), `package.json` (the `test:mock` script) and `public/mock-cover.svg`, plus whatever #60 QA accepted (expected: none outside its bounded files). #61 must not add to that list. The check is:

```sh
git diff --stat graded-baseline-2026-10-19 HEAD -- . ':(exclude)_docs' ':(exclude)frontend' ':(exclude)app/mock' ':(exclude)tests/frontend' ':(exclude)tests/fixtures/mock-*'
```

### New files and their jobs

| File | Job |
| --- | --- |
| `_docs/mock-integration.md` (this page) | Defaults, the completed coverage matrix, evidence table and results |
| `_docs/frontend-contract-handoff.md` | Typed operation/result/error/context handoff for #43 (see below) |
| `tests/frontend/coverage.test.ts` | Mechanical check of the coverage matrix against the inventory, the live service object and the test files |
| `tests/frontend/integration.test.ts` | Service-level connected journey, stable-ID assertions, operation sweep for P/F/C and reset |
| `tests/fixtures/mock-integration-journey.mjs` | Browser journey, called once from `tests/fixtures/mock-foundation-browser-check.mjs`, at 375 px and 1280 px |
| `_docs/evidence/mock-frontend/*.png` | The committed synthetic screenshot set (exactly the 14 files below) |

Other changes are limited to integration fixes that verification exposes (each with a regression test that fails before the fix), the runner's evidence-capture option, and the living documents listed under [Documents to update](#documents-to-update).

## Coverage matrix rules

The Engineer completes the [matrix skeleton](#coverage-matrix-skeleton) in this page. `tests/frontend/coverage.test.ts` parses it and fails when any rule breaks:

- **IDs:** each of the 40 domain IDs in `operation-inventory.md` (A01–A05, G01–G08, L01–L04, W01–W08, M01–M06, P01–P05, K01–K04) and U01–U06 appears exactly once. The test reads the IDs from the inventory file, so a renamed or missing row fails.
- **Methods exist:** every `namespace.method` named in the *Typed method(s)* column exists as a function on `createMockService()`.
- **No unused adapter:** the set of all functions on the live service object (every namespace, including `picker`) equals the set named in the matrix plus the [mock-only list](#mock-only-members-excluded-from-openapi). An unlisted method fails, and so does a listed method that no longer exists.
- **No pending domain:** `pendingDomains` is empty (or removed), and `/mock` shows no "Not available yet" entry.
- **Real tests:** each S/E/P/F/C cell names one or more tests as `file › test title`. The test checks that the file exists and contains that exact title. A cell may say `n/a — <reason>` only where the inventory itself has no such case: never for P, F or C on the 40 domain rows ("Every operation below requires P/F/C"). U rows may use `n/a` with a reason.
- **No placeholders:** no empty cell, `TBD`, `TODO` or `?`.
- **Shared P/F/C tests are allowed only if they invoke the operation.** The operation sweep in `integration.test.ts` may cover P/F/C for many rows at once, but only for the methods it actually calls, and it must assert no write for each one.

**Surface column:** names the `/mock` panel and the visible control, for example *Accounts › Register*. Every production route in the inventory's *Current route* column must have a `/mock` surface. **Journey column:** names the step label in `mock-integration-journey.mjs` or an existing journey (`mock-*-journey.mjs`) that reaches that surface at both widths.

### Mock-only members excluded from OpenAPI

These exist for the synthetic demo only. The coverage test treats them as known, and the #43 handoff marks them **not part of the HTTP contract**: `context.initialIdentity`, `context.read`, `context.reset`, `entry.advanceTime`, the `scenario` field of `RequestOptions` and the `outcome` field of `ProviderOptions`. The Engineer may add a member to this list only with a one-line reason here; adding a domain operation to it to escape coverage is a defect.

## Connected journey

Both the service test and the browser journey start from a fresh instance and use **Ready** unless a step says otherwise. Record the IDs a step returns and assert them in later steps. The browser reads IDs from visible text such as *Stable title: …*, *(record …)* and the record IDs in group-visible history. Group member identity is proven through personal record IDs (`personal-<titleId>-<memberId>`) and the service test's deep equality.

1. **Accounts:** register a new synthetic account, see the once-only code, continue, sign out, then sign in as `Demo.Owner`.
2. **Groups:** load and select *Synthetic Friday friends*. Create a new account group (creation selects it), continue past its invite, then select Friday again.
3. **Library:** read All and Mine. Record the seeded IDs (`joint-movie`, `saved-series`, `saved-anime`, `saved-video`).
4. **Manual entry:** save a Funny movie of exactly 15:00 as `Demo.Owner`. Its ID `X` shows in the save message, All, Mine and detail.
5. **Provider entry:** a YouTube title search, an explicit candidate, automatic fill, a mood, Save, giving ID `Y`. Then sign in as `Demo.Viewer` and save the same provider candidate (through the confirmation step if one is offered): the result is the **same** `Y` with two adders and unchanged metadata and history (W05).
6. **Personal:** as `Demo.Viewer`, on `Y` save a timestamp, a rating and a note. History shows `personal-Y-friday-viewer` attributed to Demo.Viewer.
7. **Picker:** select Demo.Viewer, 15 minutes, Funny. The exact tier gives A Small Good Idea, then `X` (equal 900 s; the older `createdAt` wins, as in [mock picker](mock-picker.md)). **Pick again** reaches `X`, and its **View details** opens *Stable title: X* inside `/mock`. A rating change on `X` leaves the cycle alone. Then change Demo.Viewer's timestamp on A Small Good Idea: the next action shows **List changed; picks refreshed.**
8. **Mine and archive:** as `Demo.Owner`, rate `X` 9 (record `personal-X-friday-owner`), then remove the only contribution on `X`. `X` leaves All, Mine and picks and appears in the archive. **Restore** returns the same `X`, back in Mine, with `personal-X-friday-owner` and its rating unchanged.
9. **Owner removal and rejoin:** as `Demo.Owner`, remove Demo.Viewer from Friday and rotate the invite. Demo.Viewer is not offered as a picker viewer, and Demo.Viewer's contribution and history on `Y` stay attributed (inactive). As `Demo.Viewer`, the old link fails and the new one joins the **same** member: `personal-Y-friday-viewer` is unchanged and Demo.Viewer is a picker viewer again.
10. **Legacy:** switch to separate legacy mode. The legacy library is readable and a legacy pick works without a selected profile (picker scenario 12). No account record appears there.
11. **Stale and cancel across domains:** at least these, each asserting no write and an announced result: Slow then **Cancel** on a manual save; Slow on a pick then a group switch (the late result is discarded); Slow on a personal save then Reset (stale); Unavailable then retry on a library read. The service test additionally holds a response across a member removal and asserts it cannot commit after rejoin.
12. **Reset:** **Reset demo** removes `X`, `Y`, the new account and the new group. Seeds come back with their original IDs, picker cycles are gone, and an identity captured before Reset returns `stale`.

## Screenshot evidence

Decision: **commit a small, fixed set of synthetic PNGs**, the same way `_docs/references/lovable-2026-10-19/` holds the reference captures. This gives the teacher's "implementation evidence" requirement something reviewable next to the references. The rule in [testing guidelines](testing-guidelines.md) that no screenshot is retained still applies to `pnpm test:e2e` and every journey that uses real or bearer-bearing data. This exception covers only `/mock` synthetic screens, and the Engineer adds one sentence saying so to the testing guidelines.

**Capture.** Add an opt-in variable to the existing runner: `WATCHNEXT_MOCK_EVIDENCE_DIR=<absolute path to a directory that does not exist yet>`. When set, `pnpm test:mock` creates it, writes the files below, prints the directory and leaves it in place. It refuses a relative path, an existing path or a path inside the repository. When unset, the run captures nothing and behaves exactly as now (the existing `WATCHNEXT_VISUAL_CHECK` behavior is unchanged). After inspecting the files, the Engineer copies them into `_docs/evidence/mock-frontend/` and deletes the temporary directory.

**Committed set (exactly 14 files):** `<family>-<width>.png` for width 375 and 1280:

| Family | State to capture |
| --- | --- |
| `sign-in` | Accounts › Sign in with empty fields and keyboard focus visibly on the username field (reached with Tab) |
| `groups` | Group management for *Synthetic Friday friends*: Creator, You, Active/Inactive labels, no invite disclosure on screen |
| `legacy` | Legacy profile chooser with the six-color palette |
| `library` | Friday All list, including the joint title with both adders |
| `add` | Add with a provider candidate list or an automatically filled review (synthetic fixture labels visible) |
| `detail` | A title detail with own personal panels and group-visible history |
| `pick` | **Pick for me** showing the first result of picker scenario 1 (**Exact match**, Together Tonight) |

**Format and limits:**

- PNG only, device scale factor 1. Each image is exactly as wide as its viewport (375 or 1280 px): capture a full-width clip around the panel, not just the element, so gutters show there is no overflow. Height at most 2400 px (clip if longer, and say so in the evidence table).
- Each file at most 500 KB and the set at most 4 MB in total. No new image tool or dependency to shrink files; clip instead.
- No `tEXt`, `iTXt`, `zTXt` or `eXIf` chunks (they could carry paths or hosts).
- **No secrets:** no password value, recovery code, invite or proof on screen (capture before entry or after disclosure is cleared). No real account, provider data, local path, host name or port. Fixture names such as `Demo.Owner` are allowed: they are public synthetic labels.

**Evidence table.** The Engineer adds a table here with file name, family, width, pixel size, bytes, SHA-256, the commit the capture was taken from, and one line of what the image shows. The capture commit must have the same product and test source as the final implementation commit (only documentation may differ).

**Inspection.** The Engineer and QA each open every committed PNG and write one observation per file: which screen, which width, no clipped control or overflow, focus visible where required, no secret. QA also runs its own capture from the current HEAD into a temporary directory, opens at least the `sign-in`, `library`, `add` and `pick` files at both widths and compares them with the committed set. Byte equality is not expected (font rendering varies). Same screen, state and width is expected. QA deletes its temporary captures.

**Other state families** are covered by the browser journey's assertions, not by committed images: empty new group, archive, pending (Slow), error and retry (Unavailable), cancelled, no-match, exhausted, conflict and the private code reveal. No screenshot of a reveal is ever taken.

## Reference versus implemented UI

`_docs/design-references.md` gets a section *Reference versus implemented (#61)*: one row per family, linking the Lovable reference capture where one exists (sign-in at both widths, desktop library, Add and picker) and the implemented evidence file, with what actually matches (for example centered form, blue primary action, card hierarchy, visible adders) and what intentionally differs (for example no type-filter chips, extra account/legacy/archive/history surfaces, rewatch control). Families with no reference (groups, legacy, detail, all mobile post-login screens) say "no reference; baseline conventions". No fidelity claim.

## Typed handoff to #43

`_docs/frontend-contract-handoff.md` lists, for every typed method on the service:

- inventory ID(s) and the inventory's proposed name next to the actual name (for example `accounts.getContext` → `accounts.read`, `invites.resolve` → `groups.resolve`, `library.saveManual`/`confirmSave` → `entry.save`);
- input parameters and their TypeScript types, and the success value type;
- failure codes (`ServiceFailure.error.code`), field keys and whether the error is retryable;
- the `stale` and `cancelled` outcomes, and what context the call requires (`expected: ContextIdentity`, active membership, selected legacy profile, contributor rights, captured title revision, invitation generation, review handle, picker step);
- the later owning stage for real HTTP (#44, #45 or #46), without inventing paths, methods or status codes;
- explicitly: client-only interactions U01–U06, internal M06 expiry, and the mock-only members listed above.

It also lists what the mock does **not** prove (authentication, password hashing, session protection, provider entitlement, persistence), so #43 and #44–#46 do not inherit false security claims. No `openapi.yml`, route handler, HTTP adapter or ORM code is created.

## Commands to run and record (serially)

`pnpm test tests/frontend`, `pnpm exec vitest run tests/picker`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:mock` (once plain, once with the evidence variable), `pnpm test:e2e`, `git diff --check`, a local Markdown link check over changed documents, and the footprint diff above. Record the actual numbers and durations. A first failing run stays recorded next to the passing rerun, as earlier issues did.

**If `pnpm test:e2e` cannot run here** for an environment reason (not a test failure), record the exact command and output, show the same failure on the accepted #60 commit, and show that the footprint diff is unchanged. That is reported as *not runnable in this environment*, never as a pass. A real test failure is a failure.

## Documents to update

- `_docs/mock-frontend.md`: final ownership table (all domains done, no pending list), the POSIX launch block, the verified lifetime/reset text and a link here.
- `_docs/operation-inventory.md`: a short *#61 integration* section pointing to the matrix. Each item of the whole-phase checklist gets an evidence link. Do not rewrite historical rows.
- `_docs/design-references.md`: the *Reference versus implemented* section above.
- `_docs/iteration-log.md`: one row each for #41, #42 and #55–#61 with commit, change, commands and results, mode (mock), actor (automated agent, not human), screenshot reference and QA verdict. Failed attempts that earlier handoffs recorded stay recorded.
- `_docs/submission-matrix.md`: the design-reference and "complete frontend with mockService first" rows updated to the actual tested state, and the two stale "Current frontend increment" paragraphs replaced by one current status line. Keep "tested" (automation) and "user-confirmed" (human, still pending #53) separate.
- `_docs/graded-mvp.md` and `README.md`: replace the stale per-increment status sentences with one accurate line each.
- `_docs/testing-guidelines.md`: a #61 section with the new tests, the evidence variable and the screenshot exception.

## Coverage matrix skeleton

The *Typed method(s)* column is pre-filled from the current contracts and the groomed #60 picker names. The Engineer confirms each name at the #60-accepted HEAD, then fills the remaining columns. Cell format for S/E/P/F/C: `file › test title`, several separated by `;`.

| ID | Inventory operation | Typed method(s) | `/mock` surface | S | E | P | F | C | Journey step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | `accounts.register` | `accounts.register` | Accounts › Register | | | | | | |
| A02 | `accounts.signIn` | `accounts.signIn` | Accounts › Sign in | | | | | | |
| A03 | `accounts.signOut` | `accounts.signOut` | Accounts › Sign out | | | | | | |
| A04 | `accounts.recover` | `accounts.recover` | Accounts › Recover account | | | | | | |
| A05 | `accounts.getContext`, `groups.listMemberships` | `accounts.read`; `groups.read` | Accounts › Read account context; Groups › Load groups | | | | | | |
| G01 | `groups.create` | `groups.create` | | | | | | | |
| G02 | `invites.resolve` | `groups.resolve` | | | | | | | |
| G03 | `groups.joinPending` | `groups.join` | | | | | | | |
| G04 | `groups.select` | `groups.select` | | | | | | | |
| G05 | `groups.useLegacyMode` | `groups.mode` | | | | | | | |
| G06 | `groups.getManagement` | `groups.read` | | | | | | | |
| G07 | `groups.removeMember` | `groups.remove` | | | | | | | |
| G08 | `groups.rotateInvite` | `groups.rotate` | | | | | | | |
| L01 | `legacy.createGroup` | `groups.createLegacy` | | | | | | | |
| L02 | `legacy.getProfiles` | `groups.read`; `groups.resolve` | | | | | | | |
| L03 | `legacy.createProfile` | `groups.createProfile` | | | | | | | |
| L04 | `legacy.selectProfile` | `groups.selectProfile` | | | | | | | |
| W01 | `library.list` | `library.list` (active) | | | | | | | |
| W02 | `library.listArchived` | `library.list` (archived) | | | | | | | |
| W03 | `library.getTitle` | `library.detail` | | | | | | | |
| W04 | `library.saveManual` | `entry.save` (manual draft) | | | | | | | |
| W05 | `library.confirmSave` | `entry.save` (with confirmation) | | | | | | | |
| W06 | `library.getEditDraft`, `library.updateTitle` | `library.editDraft`; `library.save` | | | | | | | |
| W07 | `library.removeOwnContribution` | `library.removeOwn` | | | | | | | |
| W08 | `library.restore` | `library.restore` | | | | | | | |
| M01 | `metadata.search` | `entry.search` | | | | | | | |
| M02 | `metadata.page` | `entry.page` | | | | | | | |
| M03 | `metadata.selectCandidate` | `entry.select` | | | | | | | |
| M04 | `metadata.saveReviewed` | `entry.save` (review handle); `entry.adopt` (Engineer confirms) | | | | | | | |
| M05 | `metadata.refreshTitle` | `entry.refresh` | | | | | | | |
| M06 | internal `lifecycle.ensureFresh` | internal maintenance in the service gate (no public method) | | | | | | | |
| P01 | `progress.saveEpisode` | `progress.saveEpisode` | | | | | | | |
| P02 | `progress.saveTimestamp`, `clearTimestamp` | `progress.saveTimestamp`; `progress.clearTimestamp` | | | | | | | |
| P03 | `progress.setCompleted` | `progress.setCompleted` | | | | | | | |
| P04 | `feedback.saveRating`, `clearRating` | `feedback.saveRating`; `feedback.clearRating` | | | | | | | |
| P05 | `feedback.saveNote`, `clearNote` | `feedback.saveNote`; `feedback.clearNote` | | | | | | | |
| K01 | `picker.getInputs` | `picker.getInputs` | | | | | | | |
| K02 | `picker.pick` | `picker.pick` | | | | | | | |
| K03 | `picker.next` | `picker.next` | | | | | | | |
| K04 | `picker.restart` | `picker.restart` | | | | | | | |
| U01 | client-only draft/import | `entry.discard`; `entry.cancelLookup` (Engineer confirms) | | | | | | | |
| U02 | client-only copy/disclosure | none (client-only) | | | | | | | |
| U03 | client-only All/Mine and navigation | uses `library.list` | | | | | | | |
| U04 | client-only preview/fallback | none (client-only) | | | | | | | |
| U05 | client-only external links | none (client-only) | | | | | | | |
| U06 | client-only navigation/focus/states | none (client-only) | | | | | | | |

**FR/NFR trace.** Below the matrix, the Engineer adds a short list mapping FR01–FR17 to the row IDs above (from the inventory's ID/FR column) and NFR01–NFR05 to their evidence: NFR01 the launch commands, NFR02 the "not security evidence" statement and isolation tests, NFR03 disclosure clearing and no storage, NFR04 keyboard and both widths, NFR05 operator commands are not frontend operations and the mock never runs them.
