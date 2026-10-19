# Design reference pack and observation boundary

October 19, 2026 · #41 documentation/reference work. Full behavior remains [specification.md](specification.md); [operation-inventory.md](operation-inventory.md) hands it to #42. No mock-service implementation, complete visual-fidelity claim or new user-test result is delivered here.

## Source priority and access record

1. Explicit user choices and the complete specification/accepted baseline take precedence over a visually incomplete prototype. Keep every account/recovery/legacy/owner/history/archive/provider/picker operation.
2. The user supplied [the Lovable project editor](https://lovable.dev/projects/a27cb1c8-23e5-452c-ab06-e3248c01bedf) and later [the public running preview](https://together-tonight-watchlist.lovable.app). Use the actually observed preview for visual direction; editor source/export access has not been established. No editor account login, purchase or project mutation was performed for this issue.
3. Existing [design-system.md](design-system.md), current components/styles and accepted 375px / 1280px baseline evidence in [enhancement-audit.md](enhancement-audit.md) remain the concrete reference for screens absent from preview inspection. #42 may adapt their visuals using the observed reference, without dropping their behavior.
4. Public workflow articles below guide architecture/process, not WatchNext screen design. No uninspected Primer/Material/v0/Claude Design output is claimed.

Earlier PM access attempts: web text access to the editor failed and in-app browser initialization failed locally. Neither establishes that the project is private. After the user supplied the preview, the orchestrator loaded it with HTTP200 and Playwright, inspected sign-in, desktop watchlist/Add/Pick and saved the originals below. Engineer independently inspected those image files and confirmed HTTP200 from the preview on October 19. The web text tool still could not render that preview; this separate tool limitation does not contradict the observed browser/HTTP result. The preview was not exported as source or audited for backend/security behavior.

## Captured originals and specific visual lessons

These are **unaltered public-prototype captures**, not regenerated app mockups or screenshots of the current repository UI. Sample/persona labels and film titles are reference content; no password, recovery code, raw invite/session/key is visible. The sign-in explicitly describes prototype-only arbitrary username/12+ character password behavior; that is **not evidence of real authentication**. Original source names are included to prevent the misleading inference that a file called mobile depicts the watchlist.

| Repo artifact / original name | Actual viewport/screen | Directly observed lesson / limit |
| --- | --- | --- |
| [Desktop sign-in](references/lovable-2026-10-19/sign-in-desktop.png), lovable-desktop.png | 1280 × 900px; sign-in with Create account tab | Centered bounded white surface, quiet brand/introduction, explicit labels, blue primary action. Tab presence does not prove registration/recovery behavior. |
| [Mobile sign-in](references/lovable-2026-10-19/sign-in-mobile.png), lovable-mobile.png | 375 × 812px; **sign-in**, not a logged-in library | Narrow gutters, stacked fields/full-width action and wrapped supporting text fit this screen. No post-login mobile watchlist/Add/Pick capture was obtained. |
| [Desktop watchlist](references/lovable-2026-10-19/watchlist-desktop.png), lovable-after-login.png | 1280 × 1207px full-page; sample Movie nights group, 3 members / 9 cards | Strong group/title hierarchy, Add action, All/Added by me switch, content-type chips, cards with duration/progress and all adder initials/names. Cards use portrait/video-shaped colored placeholders; not licensed poster imports or proof of list mutations. |
| [Desktop Add](references/lovable-2026-10-19/add-desktop.png), lovable-add.png | 1280 × 900px; blank Add form, Movie selected | Search-or-link field separated from editable type/title/runtime/genres/moods; clear primary Save. Observed blank form does not establish providers, dirty replacement, paging, numbering, manual-runtime gates or persisted save. |
| [Desktop picker](references/lovable-2026-10-19/picker-desktop.png), lovable-pick.png | 1280 × 900px; input screen | Viewer chips, time presets plus custom minutes, fixed mood chips and pending-incomplete disabled action. Result/rewatch/fallback/Pick again/exhaustion behavior was not inspected. |

Provenance checksums (SHA-256 of original copied PNG bytes):

- sign-in-desktop: 82043b21837f4c3da86e50b9c42592cb363713a64f098911fb720ac16005e9cb
- sign-in-mobile: 4e155d83035538f2417288702df651e4a86dab14b85ad6f448f7a49fad05b987
- watchlist-desktop: 357d93a87487d8309ec99df840a0ce440ce46398b1cbaf3892e5f67b518f10e1
- add-desktop: 60c43b0d68a9d9f261818cca9c8835df2ecd25110eb09a1fc9ddee1da14b0969
- picker-desktop: 300b06d37a3489101c8f652d43f29453c1f6a56f90d02117d8bce4709ff12332

## Baseline-to-preview choices for #42

Reuse the complete accessible baseline while applying these concrete, bounded visual lessons: pale background/white surfaces/blue action already align with its tokens; use the preview's group-heading/card hierarchy, visible adder names and clear form grouping. Preserve real loading/error/empty/access/stale states rather than copying its hardcoded3 members / 9 titles. Derive counts from mock service data, then real returned data in later phases. Do not copy gradient cover placeholders as provider metadata or invent images.

Preview content-type filter chips are **observed reference only**, not a new agreed feature or API. Required All/Mine and all four type forms remain. The inspected header has only Watchlist/Add/Pick; #42 must keep account groups, creator administration, recovery, legacy access, archive/detail/edit/history reachable. Prototype absence is not permission to remove them. No detail/edit/account/owner/recovery/legacy interaction was observed; no mobile library or picker observation is claimed.

The responsive table and S/E/P/F/C inventory in [operation-inventory.md](operation-inventory.md) specify missing mock-state/wireframe needs at 375px / 1280px. Baseline keyboard focus/skip link/labels/44px controls, safe16:9 / 2:3 image ratios and no-overflow behavior remain requirements. #42 must produce and test actual missing screen/state compositions, not invent an unobserved Lovable screenshot or declare fidelity before comparison.

## Verified secondary workflow guidance

Engineer opened both public articles on October 19: [Build and Ship a Full-Stack App with AI Coding Assistants](https://aishippingblog.com/p/build-and-ship-a-full-stack-app-with) describes a centralized mocked service, a frontend-derived OpenAPI agreement, memory HTTP integration and subsequent SQLite persistence. Its example stack is illustrative; it allows other backend technologies. [AI-Native Development: Specifications, Loop and Graph Engineering](https://aishippingblog.com/p/ai-native-development-specifications) supplies the specification/issue/role workflow context. These do not require replacing the user's Next.js/TypeScript choice with Python, purchasing design services or asserting untested ORM portability. Teacher wording and evidence gaps are separately recorded in [brainstorming-evidence.md](brainstorming-evidence.md) and [submission-matrix.md](submission-matrix.md).
