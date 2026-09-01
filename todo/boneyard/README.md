# Boneyard

Tasks that were deliberately abandoned, kept for the reasoning rather than the plan.

## What goes here

A task belongs in the boneyard when it is **no longer worth doing** — not when it is
merely unfinished or blocked. The distinction matters:

| Situation | Where it goes |
|---|---|
| Finished | `todo/done/` |
| Not started, still worth doing | stays in `todo/` |
| Blocked on something external | stays in `todo/`, with the blocker named |
| **Not worth doing any more** | **here** |

Typical reasons: the problem solved itself, the cost turned out to exceed the benefit,
the approach was superseded, or the premise stopped being true.

## Why keep them at all

Deleting an abandoned task loses the most useful part of it — the reasoning. Six months
on, the question is rarely "what was the plan?" but **"why didn't we do this?"** A task
that is silently deleted gets re-proposed, re-researched, and re-abandoned. One that is
filed here answers itself.

It also protects against the opposite mistake. If a task was shelved because of a
constraint that later disappears, the recorded reason is what tells you it is worth
reopening.

## How to file a task here

1. **Add an "Abandoned" section at the top of the task file**, before the description:
   - the date
   - **why** — the actual reason, in enough detail to be re-judged later
   - **what would change the decision** — the condition under which it should be revived
   - anything already built for it that is worth keeping
2. Change `**Status**` to `ABANDONED`.
3. `git mv todo/<id>-<slug>.md todo/boneyard/<id>-<slug>.md`
4. Remove its line from `TODO-INDEX.md` and update the header count.
5. Add a one-line entry to the Contents list below, with the reason in the line itself —
   so the folder can be skimmed without opening anything.

**Never** move a task here without an explicit instruction, exactly as with `done/`.
Deciding something is not worth doing is a judgement call, not a housekeeping step.

## Reviving a task

Move the file back to `todo/`, set `**Status**` to `TODO`, and **leave the Abandoned
section in place** with a note about what changed. The history of having rejected it once
is context, not clutter — it tells the next reader that the objection was considered.

IDs are permanent. A revived task keeps the number it had.

## Contents

- [9 github-oidc-ci-role](9-github-oidc-ci-role.md) — Abandoned 2026-08-31. Would have
  Terraformed a GitHub→AWS OIDC trust so CI could run the infra tests unattended. Not
  worth a standing cross-cloud trust relationship on a solo personal site when
  `pytest tests/infra` takes five seconds locally. Revive if CI ever genuinely needs AWS.
