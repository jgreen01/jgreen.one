# TODO Task Management

Track tasks for the jgreen.one project.

## Structure

```
todo/
  TODO-INDEX.md       # Master index of all tasks
  TEMPLATE-task.md    # Template for new task files
  [task-name].md      # Individual task files
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
4. When done, move it to "Recently Resolved" in the index; if abandoned, move the file to `boneyard/` with a reason.
