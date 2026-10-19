# Isolated mock frontend foundation — issue #42

This delivers **the foundation, synthetic accounts, group/legacy flows and saved library**, not the full mock frontend. `/mock` exercises a real typed asynchronous context read/reset with deterministic Ready/Slow/Unavailable outcomes. It always labels itself **Synthetic demo only / not real authentication**. The #55 synthetic account journey has independent QA acceptance; #56 group/legacy flows have independent QA acceptance. #57 saved library is implemented and Engineer-tested, awaiting QA. Manual/provider entry, personal records and picker remain unavailable until their owning issues. Existing production routes remain the normal default; their business operations are unchanged.

## Open the preview

Use the existing Node24/pnpm11.25 setup and the committed frozen dependencies. Work in your own checkout/output; do not restart someone else's running server. No new package, service, provider key or `db:init` is needed for this preview.

For a manual isolated local session in PowerShell, choose an unused port and a new owned folder:

```powershell
pnpm install --frozen-lockfile
$previewDir = Join-Path ([IO.Path]::GetTempPath()) ('watchnext-preview-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $previewDir | Out-Null
$env:WATCHNEXT_DATABASE_PATH = Join-Path $previewDir 'unused.sqlite'
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3100'
$env:YOUTUBE_API_KEY = ''
$env:KINOPOISK_UNOFFICIAL_API_KEY = ''
pnpm dev --port 3100
```

Open **http://127.0.0.1:3100/mock**. Stop only this server with Ctrl+C when finished. Do **not** initialize that unused database. To use the existing supported production launcher instead, stop dev, keep the same environment, run `pnpm build`, then `pnpm start --port 3100`, and open the same URL. The owned browser check below actually builds/serves the production entry with the existing privacy preload; dev is the existing supported development launcher, not a new mode script. Normal `/` still presents the actual account/legacy entry. Exit demo deliberately returns there; it does not turn that page into mock data.

The path is the explicit selector: there is **no global mode environment variable** and no production query switch. `/mock?mode=mock&scenario=slow` is a valid synthetic entry; default scenario is Ready. On this path, any mode except absent/exact mock, or any scenario except absent/ready/slow/unavailable (including repeated selectors), shows a safe unsupported-selection error and no working preview controls. `/mock?mode=http` cannot enable a future HTTP adapter. Arbitrary member/group/query claims are not consumed as authority. `/?mode=mock` and `/watchlist?mode=mock` keep their existing production behavior; failures never fall back to demo data.

## Actual state and lifetime

1. Press **Load preview**: context appears only after the service completes, showing Synthetic workspace, its current synthetic account (or anonymous), no group and its revision.
2. Choose **Slow** to observe pending state and **Cancel request**. Choose **Unavailable** for an announced retryable error, then Ready and Load to retry. Failed/canceled reads keep the last displayed successful context.
3. **Reset demo** aborts a superseded UI request and advances only this service instance's context revision. It does not reset the application, a database, the separate seeded academic demo or another preview tab. Canceling before reset commits leaves that revision unchanged.
4. A new tab/reload creates a new service instance at revision 0. No cookies, localStorage, sessionStorage, filesystem storage or backend persistence is used. State belongs to the mounted preview; browser history/bfcache may restore a live in-memory document, so use Reset or reload for an explicit fresh context. No durable cross-navigation/session guarantee is claimed.

Ready waits 80ms, Slow 1200ms, Unavailable 300ms; callers cannot supply arbitrary delays or indefinite pending. Abort removes the timer/listener. Reset requires the captured instance/revision; two competing resets have one success, stale reads/results after a reset are rejected. These identities are synthetic coordination tags, **not authentication credentials**. Real security remains in the existing application and future server stages.

## Typed boundary and isolation

- `frontend/service/contracts.ts`: concrete context identity, discriminated success/failure/field/stale/cancel results, request signal/scenario and checked demo selection. Success is parameterized by an actual value type, not an untyped generic acknowledgement.
- `frontend/mock/service.ts`: per-instance `FrontendService.context.read/reset`; no native/server/database/auth/provider imports, environment reads, cookies, persistence or fetch. The account namespace now implements A01-A05; other namespaces remain unavailable until their owners.
- `app/mock/page.tsx` and `preview.tsx`: explicit entry, input-selection errors, persistent notice, real pending/error/cancel/reset/readback and focused feedback. `preview.module.css` reuses existing light tokens/controls and narrow layouts; no claim of complete Lovable UI parity.
- `Navigation` switches only on the explicit mock path. Its mock links do not prefetch production screens/actions; Exit uses deliberate navigation. Normal links/destinations remain unchanged outside that path.

Do not enter real credentials or use normal/provider data. Domain follow-ups must continue the [synthetic policy](operation-inventory.md), not reinterpret this foundation as server authorization. There is no HTTP/OpenAPI/ORM implementation here.

## Domain handoff - accounts accepted, groups implemented, remaining domains pending

The [implemented #55 account handoff](mock-accounts.md) documents exact validation, once-only recovery, navigation lifetime and bounded evidence. It is independently QA-closed at `269abbc`; other domain increments remain planned.

The [#56 group/owner/invitation/legacy handoff](mock-groups.md) documents the accepted domain and its generation/lifetime checks; independent QA closed it at `391d312`. The next [#57 library handoff](mock-library.md) is PM-groomed, not implemented by this document.

| Owner | Inventory coverage |
| --- | --- |
| #55 (QA accepted) | Accounts/recovery A01–A05 |
| #56 (QA accepted) | Account groups/owner G01–G08 and legacy L01–L04 |
| #57 (Engineer-tested; QA pending) | Saved library/Mine/detail/edit/archive W01–W03/W06–W08 |
| #58 | Manual/provider Add and lifecycle W04–W05/M01–M06 |
| #59 | Personal progress/completion/feedback P01–P05 |
| #60 | Picker/cycle K01–K04 |
| #61 | All 40 domain operations/six U groups integrated and complete phase evidence |

[The full inventory](operation-inventory.md), [observed references](design-references.md) and [graded plan](graded-mvp.md) remain authoritative. A #42 PASS is not full frontend completion; #43 waits for all follow-ups/final integration. Backend/ORM issues remain outside frontend authorization.

## Verification commands and limits

```sh
pnpm test tests/frontend
pnpm test
pnpm typecheck
pnpm exec playwright install chromium
pnpm test:mock
```

`test:mock` **builds current selected source**, then starts its own privacy-protected production server with a deliberately absent configured database, empty provider keys and isolated home/default paths. Pinned Chromium uses 375px / 1280px contexts to exercise real service state, pending/failure/retry/cancel/reset/reload/two-tab isolation, invalid/repeated selectors, keyboard/overflow and unchanged production/query routes. Mock requests are restricted to its entry/framework assets; no production action/API/external request is permitted. Neighboring synthetic normal/demo/file sentinels remain byte-identical. No database is initialized or imported by the harness. Its own server/browser/temp files are cleaned after success/failure; it never kills by name or touches a user's normal server.

Focused tests also prove stale/reset races, abort cleanup, typed selectors and a recursively checked client-safe import closure. The ordinary suite retains native crypto/default timeouts and full discovery. Existing build tracing warning is unchanged. No full-domain/real-auth/mock-phase-completion or genuine user-test claim is made; #61 owns the complete frontend walkthrough. Runtime/results are recorded in the Engineer issue handoff and independently checked by QA.

Engineer verification: 13 focused foundation tests pass; ordinary suite passes **90 files / 971 tests**, unchanged security cost/timeouts/discovery; typecheck passes. `pnpm test:mock` current-source production build and both-width smoke pass, including owned cleanup and unchanged sentinels. Synthetic-only screenshots at 375px / 1280px were inspected for layout/focus/warning and deleted with the fixture. An initial smoke expected an auth-error view despite deliberately missing production DB; it was corrected to compare the existing load-error view against the same forged-query route, without changing production code. These are Engineer results, not independent QA PASS. Verification used owned M-drive temp/cache/browser paths because C storage was constrained; the runner itself has no machine-specific path.

The account extension adds real synthetic registration/sign-in/sign-out/recovery/context forms to the same service instance; see [account implementation](mock-accounts.md). Foundation-only verification numbers above are historical #42 evidence, not the new total. `test:mock` now additionally runs the full account journey at both widths while preserving every foundation isolation/sentinel assertion.

The [group/legacy implementation](mock-groups.md) extends the same typed service with G01-G08/L01-L04 and group U02/U03/U06 interactions. `test:mock` now runs creator removal/rotation/rejoin, anonymous account continuation and separate legacy create/resolve/profile at both widths, preserving foundation/account isolation checks. #57-#61 remain pending; earlier issue-specific counts are historical evidence.

The [implemented saved library](mock-library.md) adds W01-W03/W06-W08 and readonly M06, with actual All/Mine/archive/detail/edit/remove-own/restore and local synthetic art. Add/provider/personal/picker mutations and whole-phase integration remain #58-#61; older issue-specific counts describe their historical verification.
