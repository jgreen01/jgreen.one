# TODO Task Management

Track tasks for the jgreen.one project.

## Structure

```
todo/
  TODO-INDEX.md       # Master index of all tasks
  TEMPLATE-task.md    # Template for new task files
  [task-name].md      # Individual task files
  done/               # Completed tasks (moved here only when Jon explicitly asks)
  boneyard/           # Abandoned tasks (with reasons)
```

## Priorities

- **HIGH** — Blocking or critical path
- **MEDIUM** — Important but not blocking
- **LOW** — Nice to have

## Status values

`TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`

## Workflow

1. Copy `TEMPLATE-task.md` to a new `[task-name].md`.
2. Add a line for it in `TODO-INDEX.md` under the right priority.
3. Update **Status** and the **Log** as work progresses.
4. When done, mark the task `DONE` and move it to "Recently Resolved" in the index. The file stays in `todo/` — do **not** move it to `done/`.
5. If abandoned, move the file to `boneyard/` with a reason.

## Done folder

`todo/done/` holds completed tasks that Jon has explicitly asked to file away.

**Agents: never move a task to `done/` unless Jon explicitly asks** (e.g. "move the billing task to done", "file the done tasks"). Completing a task does not trigger a move. Tasks sit in `todo/` marked DONE until Jon says to file them — this keeps them visible for review before they're filed away.

When asked to file a task:
1. `git mv todo/<task-name>.md todo/done/<task-name>.md`
2. Remove its "Recently Resolved" entry from `TODO-INDEX.md`.
3. Commit: `chore(todo): file <task-name> as done`.
