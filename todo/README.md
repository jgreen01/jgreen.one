# TODO Task Management

Track tasks for the jgreen.one project.

## Structure

```
todo/
  TODO-INDEX.md           # Master index of all tasks
  TEMPLATE-task.md        # Template for new task files
  <id>-<task-name>.md     # Individual task files
  done/                   # Completed tasks (moved here only when Jon explicitly asks)
    README.md             # how to file a completed task
  boneyard/               # Abandoned tasks — kept for the reasoning, not the plan
    README.md             # how to file and how to revive
```

A task lives in exactly one of three places, and which one says what it means:

| Location | Meaning |
|---|---|
| `todo/` | still worth doing — whether started, blocked, or untouched |
| `todo/done/` | finished |
| `todo/boneyard/` | **deliberately not worth doing**, with the reason recorded |

The distinction between "blocked" and "abandoned" is the one that matters. A blocked task
stays in `todo/` with its blocker named; it is still wanted. A boneyard task is one
somebody decided against.

## Task IDs

Tasks use bare base36 IDs (no padding, no prefix): `1`, `2`, `3`… `9`, `A`, `B`… `Z`, `10`, `11`…

- Filename format: `<id>-<slug>.md` — e.g. `1-aws-billing-alarms.md`
- Reference tasks by ID in conversation: "task 1", "task A", "task 2"
- Assign the next ID in sequence when creating a new task. Check the index for the current highest ID.
- IDs are permanent — never reassign a retired ID.

## Priorities

- **HIGH** — Blocking or critical path
- **MEDIUM** — Important but not blocking
- **LOW** — Nice to have

## Status values

`TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE` | `ABANDONED`

## Workflow

1. Copy `TEMPLATE-task.md` to a new `<id>-<slug>.md` (next ID in sequence).
2. Add a line for it in `TODO-INDEX.md` under the right priority.
3. Update **Status** and the **Log** as work progresses.
4. When done, mark the task `DONE` and move it to "Recently Resolved" in the index. The file stays in `todo/` — do **not** move it to `done/`.
5. If it turns out not to be worth doing, mark it `ABANDONED` and file it to `boneyard/` — again, only when Jon asks. See `todo/boneyard/README.md`.

## Done folder

`todo/done/` holds completed tasks that Jon has explicitly asked to file away.

**Agents: never move a task to `done/` unless Jon explicitly asks** (e.g. "move task 1 to done", "file the done tasks"). Completing a task does not trigger a move. Tasks sit in `todo/` marked DONE until Jon says to file them — this keeps them visible for review before they're filed away.

When asked to file a task:
1. `git mv todo/<id>-<slug>.md todo/done/<id>-<slug>.md`
2. Remove its "Recently Resolved" entry from `TODO-INDEX.md`.
3. Commit: `chore(todo): file task <id> as done`.

## Boneyard folder

`todo/boneyard/` holds tasks that were **deliberately abandoned** — decided against, not
merely unfinished. Full procedure in `todo/boneyard/README.md`.

**Agents: never move a task to `boneyard/` unless Jon explicitly asks.** Judging that
something is not worth doing is a decision, not housekeeping — the same rule as `done/`.

The point of the folder is the **reasoning**, not the plan. A deleted task gets
re-proposed, re-researched and re-abandoned six months later; a filed one answers the
question "why didn't we do this?" on its own. Each file therefore records why it was
dropped **and what would change the decision**, so a task shelved over a constraint that
later disappears can be found and revived rather than forgotten.

When asked to file a task here:
1. Add an **Abandoned** section at the top of the file — date, the real reason, what would
   change the decision, and anything already built that is worth keeping.
2. Set `**Status**` to `ABANDONED`.
3. `git mv todo/<id>-<slug>.md todo/boneyard/<id>-<slug>.md`
4. Remove its line from `TODO-INDEX.md`; update the header count.
5. Add a one-line entry to the Contents list in `todo/boneyard/README.md`, **with the
   reason in the line** so the folder can be skimmed without opening files.
