- Tasks are GitHub issues, one at a time
- Read the acceptance criteria before starting and before closing
- Commit regularly

Planning-only requests stop after PM documents and issues. Creating a groomed issue does not start the Engineer/QA lifecycle. After that phase, the user explicitly authorized the October 18 enhancement (#31–#40): “выполни оставшиеся ишшюс на гитхабе” (implement the remaining GitHub issues). Refresh PM grooming and implement sequentially through the lifecycle below; closure requires fresh independent QA PASS. This supersedes the earlier planning pause, not the feature boundaries. See `_docs/account-discovery-enhancement.md`.

## Roles

- PM - grooms a task before anyone implements it, follows _docs/team/pm.md
- Engineer - implements one groomed task, follows _docs/team/software-engineer.md
- QA - checks the result against the acceptance criteria, follows _docs/team/qa-engineer.md

## Orchestrator

The main session is the orchestrator. It launches the PM, the engineer
and QA as subagents. It does not groom, implement or test itself.

## Lifecycle

1. Pick the next open issue from the backlog
2. PM grooms it
3. Engineer implements it
4. QA verifies it
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, close the issue
7. Repeat until the backlog is empty

## Rules

- Do not skip step 2
- The engineer does not close the issue
- QA does not fix the code, only outputs PASS or FAIL
- The orchestrator closes the issue only after QA outputs PASS
