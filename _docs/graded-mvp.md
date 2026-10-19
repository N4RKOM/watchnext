# Graded MVP plan

October 19, 2026 · **First step only: documentation and backlog created. New implementation is not started or authorized by this plan.**

## Baseline and goal

The complete current WatchNext feature set is described in [specification.md](specification.md). All original issues 1–40 are closed after independent QA; [final verdict](https://github.com/xiaodlb/watchnext/issues/40#issuecomment-6263933927). Preserve exact baseline 441fcaae660e273d6fc373f8757be562d9139b78 and annotated tag **graded-baseline-2026-10-19**.

The graded iteration changes architectural delivery/evidence, not product scope. Keep **all** account/recovery, legacy separation, group/invite/owner, four-type library, manual/provider autofill/previews, own progress/feedback, picker/cycle, archive/restore, shared attribution and Mine behavior. Do not reduce “MVP” to one unused demo screen or add unrelated features.

Teacher requirements available in this session are summarized as: complete frontend with mock data first, root OpenAPI contract, real HTTP backend with in-memory storage, real full-domain ORM-backed SQLite with documented database-specific limits, genuine hands-on user testing/bug iterations, and traceable reference/brainstorming/implementation evidence. The teacher rubric text is available in the user conversation and must be mapped faithfully in the evidence task. The deadline is **unknown**; do not invent it or guarantee a grade.

## Architecture target — planned

Keep Next.js/TypeScript and Next Route Handlers, one repository and the existing local academic deployment. No mandatory FastAPI/Python/new backend repository. A centralized typed frontend service has explicit mock and HTTP adapters. Real HTTP handlers invoke domain services through repository interfaces, with isolated memory and Prisma-backed durable adapters. Pure eligibility/ranking and security rules remain shared.

[Prisma supported databases](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases) include SQLite/PostgreSQL; [baselining guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining) addresses existing important data and custom database elements. These support a proposed tool choice, not proof this project is already database-independent. Pin a compatible version only in the future owning issue.

Prisma must actually implement the complete application repositories, not one unused table. Preserve current stable IDs, password/recovery/session hashes, memberships/generations/context, titles/contributions/history, nullable imported fields, deadlines and immutable native migration evidence. Enumerate SQLite triggers/checks/secure deletion/transaction assumptions; retain equivalent domain/DB protections and adapter-specific SQL where genuinely necessary. Baselining never means reset/db push of normal data. The required MVP uses real full-domain ORM/repositories with documented SQLite-specific limits. Optional PostgreSQL proof is post-mvp #52, not a grading gate; any future claim of tested portability needs actual disposable execution, not schema generation alone.

Mock UI uses only clearly synthetic data and makes no real-security claim. Memory backend has real server authentication/permissions/native crypto and loses data on restart. Prisma SQLite persists across restart. These modes must never read/reset/migrate the normal database accidentally. CLI backup/maintenance remain legitimate operator operations, not frontend HTTP shortcuts.

## Sequential backlog and phase gates

Thirteen new required issues carry mvp; optional #52 carries post-mvp. All remain open. Their creation does not begin implementation; after a new request, PM refreshes the selected issue, then Engineer and QA work one issue at a time.

| Order | Issue | Phase/evidence |
| --- | --- | --- |
| 1 | [#41 Inventory/reference pack](https://github.com/xiaodlb/watchnext/issues/41) | Full-operation inventory, rubric mapping, references/wireframes and real chat-source inventory |
| 2 | [#42 Complete mock frontend](https://github.com/xiaodlb/watchnext/issues/42) | All screens/operations use typed mock services; synthetic UI walkthrough |
| 3 | [#43 root openapi.yml](https://github.com/xiaodlb/watchnext/issues/43) | Validated complete HTTP schemas/examples/auth/errors and operation map |
| 4 | [#44 Memory identity/groups HTTP](https://github.com/xiaodlb/watchnext/issues/44) | Real server auth/recovery/group/legacy context over memory repository |
| 5 | [#45 Memory library/provider HTTP](https://github.com/xiaodlb/watchnext/issues/45) | Real shared saves/lookup/reviews/expiry and archive/Mine |
| 6 | [#46 Memory personal/picker HTTP](https://github.com/xiaodlb/watchnext/issues/46) | Real own history/feedback and full picker/cycle truth tables |
| 7 | [#47 Complete UI-to-HTTP wiring](https://github.com/xiaodlb/watchnext/issues/47) | Every operation demonstrated over HTTP; restart proves memory loss |
| 8 | [#48 Prisma mapping/baseline](https://github.com/xiaodlb/watchnext/issues/48) | Data-safe schema/constraint inventory and owned populated upgrade copies |
| 9 | [#49 Prisma identity/group repositories](https://github.com/xiaodlb/watchnext/issues/49) | Actual durable auth/group use and parity tests |
| 10 | [#50 Prisma library/history repositories](https://github.com/xiaodlb/watchnext/issues/50) | Actual durable library/provenance/history and picker projections |
| 11 | [#51 Full Prisma SQLite integration](https://github.com/xiaodlb/watchnext/issues/51) | Same full HTTP UI, restart/backup/restore/upgrade evidence |
| Optional | [#52 Real PostgreSQL portability](https://github.com/xiaodlb/watchnext/issues/52) | Post-MVP only; no dependency for #53/#54 |
| 12 | [#53 Genuine user testing/bugs](https://github.com/xiaodlb/watchnext/issues/53) | Hands-on checklist and actual user-test-bug regression iterations |
| 13 | [#54 Submission package](https://github.com/xiaodlb/watchnext/issues/54) | Complete accurate matrix, artifacts/commands and QA closures |

Each issue identifies dependencies/files/limits. Full feature coverage is checked at every phase; a phase may use mock provider transport but not fake application writes. Existing baseline regressions remain meaningful. Current commands still describe the native-SQL baseline. **Future mode selectors/ORM commands do not exist yet**: owning issues must introduce, document and verify exact commands; do not present proposed names as runnable. No empty openapi.yml is created in this first step.

## Teacher workflow for this iteration

The scoped rules below supersede earlier orchestrator-closure/no-QA-test-change rules **only for new mvp/user-test-bug issues**, without rewriting closed 1–40.

1. PM grooms the issue, checkable acceptance criteria and scope.
2. For an actual user-test-bug, QA adds concrete runnable regression case(s) reproducing the reported defect before Engineer work, recording expected versus observed failure. QA may edit tests, never product implementation. Use a reviewable red-regression commit/branch until fixed; do not skip the case.
3. Engineer implements/fixes against criteria and QA regressions, runs full required checks, commits and comments; leaves issue open.
4. QA independently verifies each criterion/current commit and tests; posts PASS/FAIL with commands/results. On FAIL, Engineer fixes. **QA closes mvp/user-test-bug only after actual PASS.** Orchestrator coordinates/observes closure.
5. Human user really exercises the application and reports genuine findings; automation is separately labeled. No invented bug count, user experience, screenshot or successful test.
6. Optional unrequested ideas are post-mvp; do not inflate tasks toward an arbitrary 100-issue target.

Labels mvp, post-mvp and user-test-bug are available. Existing closed issues are not retagged/reopened. Use [bug template](user-test-bug-template.md), [manual checklist](manual-testing.md) and [iteration log](iteration-log.md).

## Evidence and preservation

Maintain [design references](design-references.md), [brainstorming provenance](brainstorming-evidence.md), [submission matrix](submission-matrix.md) and the living specification as implementation changes. Mark planned, implemented, tested and user-confirmed evidence distinctly. Full original chat export must come from actual available messages or user export; never reconstruct missing assistant turns from numeric answers.

During this documentation step, no app/test/config/schema/dependency/runtime/normal-data changes occur. Future work uses owned checkouts and disposable DB/browser/provider fixtures, keeping the user's M server/.next/next-env.d.ts and normal/demo data untouched. User screenshots use synthetic personas and mask passwords/codes/tokens/invitations. Do not stop their server, buy services, inspect keys, or silently migrate their DB. Baseline tag is a code reference, not permission to reset user data.
