# WatchNext agent instructions

## Project context

WatchNext is an academic web app that helps couples and friends choose something from their shared saved watchlist. The selected stack is Next.js, TypeScript, and SQLite, initially running locally at `http://localhost:3000`.

- Product requirements: `_docs/plan.md`.
- Backlog index: `_docs/tasks.md`.
- Repository: https://github.com/xiaodlb/watchnext.
- Task descriptions and live task state: GitHub issues linked from the backlog index.

## Start each session

1. Read this file, `_docs/plan.md`, and `_docs/tasks.md`.
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

- Use the selected stack and existing repository conventions. Choose missing libraries only when required by the selected task, documenting material choices.
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
