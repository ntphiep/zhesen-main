---
name: fix-issue
description: Take one issue from the ZHESEN board to a verified commit. Use when the request names an issue number, says "làm issue #N", or asks to fix, implement or close a tracked item.
arguments: [number]
---

# Fix issue #$number

One issue per session. If the request names several, do the first and say so.

## 1. Read the issue before anything else

```bash
gh issue view $number --repo ntphiep/zhesen-main --comments
```

Restate in one sentence what a user will be able to do afterwards. If the issue does not say
what "done" means, stop and ask; do not invent an acceptance criterion.

## 2. Decide whether it needs a plan

A one-file change with an obvious fix goes straight to step 3. Anything touching more than
one file, or auth, the search path, a migration or the FSRS schedule, goes to the `planner`
agent first. Read the plan yourself before acting on it.

## 3. Implement

Delegate to the `implementer` agent, or do it inline when the diff is a few lines.
`AGENTS.md` and the matching `.claude/rules/` files are the standard. Minimal diff, inside
the issue's scope, nothing extra.

## 4. Prove it

- `tester` agent writes the failing test first where a test can express the defect, then the
  fix makes it pass. Never edit a test to make it pass.
- `npm run verify` must exit 0.
- A change that renders goes through `/verify-ui`. A green suite is not evidence a screen
  works.
- A data change reports the real query result, not an estimate.

## 5. Review before committing

Send the diff to the `reviewer` agent. It reads and reports; you fix what it finds. A
finding without a concrete failure case is a question, not a blocker.

## 6. Commit and close

Conventional Commits, subject at most 72 characters. Reference the issue in the body so it
closes on merge:

```
fix(scope): what a user sees change

Closes #$number
```

Then move the board item and comment the evidence on the issue with the `backlog` agent.

## Stop conditions

Report and stop, rather than working around it, when: the issue's acceptance criterion is
missing, a test fails for a reason outside the issue, the fix would need a destructive
command, or the change turns out to contradict a rule in `AGENTS.md`.
