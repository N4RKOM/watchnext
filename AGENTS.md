# WatchNext agent instructions

## Commands

- `uv sync` - install dependencies
- `uv run pytest` - the whole suite
- `uv run pytest tests/test_home.py` - one test file

These user-supplied commands describe a Python toolchain. This repository currently has no `pyproject.toml` or Python test suite, and its selected application stack remains Next.js, TypeScript, and SQLite. Do not treat these commands as verified or introduce a Python implementation merely to make them work; document the actual application commands when setup is authorized.

## Rules

- Dependencies are added in `pyproject.toml`. Do not add one without asking.

The `pyproject.toml` location applies to Python dependencies. For the selected Next.js stack, dependencies belong in `package.json`; ask before adding dependencies there as well.

## Project context

WatchNext is an academic web app that helps couples and friends choose something from their shared saved watchlist. The selected stack is Next.js, TypeScript, and SQLite, initially running locally at `http://localhost:3000`.

- Product requirements: `_docs/plan.md`.
- Work process: `_docs/process.md`.
- Backlog index: `_docs/tasks.md`.
- Repository: https://github.com/xiaodlb/watchnext.
- Task descriptions and live task state: GitHub issues linked from the backlog index.

## Documents

- `_docs/process.md` - how work is organized.
- `_docs/plan.md` - agreed product scope and unresolved decisions.
- `_docs/tasks.md` - links to the GitHub backlog issues.
- Before writing tests, read `_docs/testing-guidelines.md` when available.
- For anything touching the UI, read `_docs/design-system.md` when available.
- Before adding or changing API behavior, read `_docs/api.md` when available.

The testing guidelines, design system, and API documents are planned and do not exist yet. Check whether they have been created in the current checkout; do not invent their contents or treat them as existing requirements. Once added, follow them for the relevant work and keep them consistent with approved project decisions.

## Start each session

1. Read this file, `_docs/process.md`, `_docs/plan.md`, and `_docs/tasks.md`.
2. Inspect the working tree and recent commits before making changes. Preserve existing work.
3. Identify the task using the rules below, then read its full GitHub issue, relevant comments, and affected files.
4. State the issue number, intended outcome, and relevant verification briefly before implementation.

## Identify the intended task

- An issue number or URL in the user's request selects that task. A concrete request without an issue may be handled within its stated scope; find the matching backlog issue when one exists.
- For a request to continue existing work, use the current branch, uncommitted changes, recent commits, and issue status to identify the unfinished task. Do not assume that the lowest-numbered issue is the task already in progress.
- If the user explicitly asks to start the next backlog task, inspect open issues in backlog order and choose the earliest unfinished task whose prerequisites are ready. Check the repository for actual completion instead of relying only on issue state, and announce the selection.
- If the task remains ambiguous, ask one concise question rather than guessing which feature to build.
- Do not start application implementation merely because a session begins, this file is read, or an issue exists. A request to plan, discuss, or edit documentation remains limited to that work.
- The backlog begins with issue #1, setting up an empty project with a passing test. Verify its current state before treating it as the next task; do not use this sentence as permanent task status.
- If GitHub is unavailable, use the local index and repository evidence. Ask for the issue description when it is needed rather than inventing missing acceptance criteria.

## Keep work bounded

- Complete one selected issue at a time unless the user explicitly requests a broader scope.
- Each issue is designed for one focused session. Document unmet prerequisites and use fixtures or stubs when appropriate instead of silently implementing other issues.
- `_docs/plan.md` records agreed requirements. Treat unresolved product decisions as proposals and make them visible before relying on them.
- Do not introduce mixed watch sessions, embedded playback, automatic progress tracking, separate account signup, or public hosting as part of the first release without a scope change from the user.

## Product rules to preserve

- One shared title entry per group, with multiple contributors; any contributor may edit the shared metadata.
- Removing the last contribution archives the title. Saving it again restores the same entry, including personal history.
- Each member has independent progress, a 1–10 rating, and notes; ratings and notes are visible to the group.
- Invite links and name selection are trust-based access, not verified personal identities. Validate group access and record ownership on the server.
- Picks use selected viewers, mood, and full item duration; series use a typical episode duration. Saved timestamps do not reduce the duration used for matching.
- Rewatches are off by default. Follow the plan's episode eligibility rules and rank matching items longest-first within the available time.
- Ratings do not influence picks. Content opens through external links.
- Manual entry must remain usable when YouTube or Кинопоиск lookup is unavailable.

## Implementation and verification

- Use the selected stack and existing repository conventions. Propose missing libraries only when required by the selected task, document material choices, and follow the dependency approval rule above before adding them.
- Keep SQLite access and provider credentials on the server. Never commit secrets, local databases, journals, or generated dependency folders.
- Application commands and a test runner do not exist until the setup task is completed. Use the commands actually defined in the repository; do not claim checks passed without running them.
- Run verification appropriate to the change and the issue's acceptance criteria. Isolate tests from normal user databases and mock external metadata providers where appropriate.
- Documentation-only changes require content, link, and diff checks rather than application tests.

## Git and handoff

- The user has authorized committing and pushing project changes to `xiaodlb/watchnext`; continue that workflow unless later instructions change it.
- Inspect the current branch and remote before committing. Stage only files belonging to the task and never overwrite unrelated work or force-push shared history.
- Reference the issue number in relevant commits. Use `Fixes #N` only when the issue is fully satisfied, since merging that commit into the default branch may close the issue.
- Keep `_docs/tasks.md` as the issue index; do not duplicate live issue state or full task descriptions there.
- For a session handoff, report the issue number, completed work, verification results, commit/push state, and any remaining work. For partial work, make the unfinished scope explicit so the next session can identify what to continue.

## Communication

Keep updates short and use plain language. Ask one question at a time when user input is needed, and distinguish verified results from assumptions or proposed decisions.
