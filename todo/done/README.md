# Done

Completed tasks live here permanently once Jon explicitly asks to move them.

## Rules

- **Never move a task here on your own.** Wait for an explicit instruction like
  "move the billing alarms task to done" or "file the done tasks." Marking
  a task DONE in the index is not permission to move it here.
- Files here are read-only history. Never edit or delete them.
- The task file stays in `todo/` (marked DONE) until Jon asks to file it.
  That way it remains visible in the index during review.

## How to file a task (when asked)

1. `git mv todo/<task-name>.md todo/done/<task-name>.md`
2. Remove its entry from the "Recently Resolved" section of `TODO-INDEX.md`
   (or drop it entirely if the index is getting long — the file is the record).
3. Update the index header count if needed.
4. Commit: `chore(todo): file <task-name> as done`.

## Contents

- [1 aws-billing-alarms](1-aws-billing-alarms.md) — Filed 2026-06-27. SNS + 4 CloudWatch alarms + $20/mo budget.
