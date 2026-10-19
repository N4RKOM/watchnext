# User-test bug template

Use only for a genuine hands-on runtime finding; do not create example/fake bugs. Labels: user-test-bug plus mvp only if it affects the agreed graded scope; optional ideas are post-mvp.

## Goal

State the observable corrected behavior. Description: explain the actual defect and affected specification/graded phase in two or three sentences.

Reproduction: tester/date, commit/mode, synthetic prerequisites, numbered exact steps. Expected: what should happen. Actual: what happened, including visible error. Evidence: safe screenshot/log reference with secrets/private URLs removed.

## Acceptance criteria

- [ ] Original steps produce the expected result, including the reported awkward case.
- [ ] QA-added runnable regression reproduces the defect before repair and passes afterward.
- [ ] Adjacent permission/history/phase behavior remains correct; required whole checks pass.

PM grooming: bound scope/root cause hypotheses without inventing facts. QA regression augmentation: name added test(s), pre-fix expected/observed failure and commit. Engineer handoff: repair commit/commands/results. Final QA: PASS/FAIL per criterion/current commit, actual commands/results; QA closes only after PASS.

## Out of scope

Link genuine moved work to its owning issue; do not silently drop core behavior or invent follow-ups merely to fill this section.

## Constraints

Name affected files/phase/contract; preserve full product/security/data invariants and isolated fixture policy. QA may add regression tests during grooming but does not fix product implementation. Engineer never closes; independent QA verifies/closes. Keep actual failed evidence, no skipped regression or fabricated user test.
