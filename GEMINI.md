# CLI LLM Operating Manual — Persistent Memory & Tasks

> Working agreement for a CLI‑enabled LLM that must **remember context, decisions, and tasks across sessions**.

---

## 1) Purpose & Scope

* Keep work moving smoothly across breaks, crashes, and context switches.
* Persist **what changed, why it changed, and what happens next**.
* Ensure no secrets are ever committed.

---

## 2) Directory Layout (authoritative)

```
.notes/                 # Per‑session logs (local only; gitignored)
.memory/                # Lightweight, structured state persisted in git
  tasks.md              # Human‑readable backlog with due dates/priorities
  state.yaml            # Small machine-oriented state (last session, pins)
  adr/                  # Architecture Decision Records
  private/              # Optional private notes (gitignored)
    scratch.md

guides/                 # How-tos, runbooks, checklists
  TEMPLATE.md

scripts/                # Repo scripts, incl. docs validation
  validate_guides.mjs

.githooks/              # Local git hooks (optional)
```

**Git policy**

* Commit `.memory/*` **except** `.memory/private/**`.
* **Never** commit `.notes/**`.

Recommended `.gitignore` additions:

```
# session notes and private memory
.notes/
.memory/private/
# common local files
.env*
.DS_Store
```

---

## 3) Session Workflow (Start → During → End)

### A) Start-of-Session Ritual

1. **Load state** from `.memory/state.yaml`.
2. **Scan last 2 session logs** in `.notes/` if present.
3. **Review backlog** in `.memory/tasks.md` for any P1 items due/overdue.
4. **Write a session goal** (1–2 lines) in a new note file.

### B) During Session

* Keep a running log in `.notes/YYYY‑MM‑DD_HHMM‑TZ.md` (template below).
* When a decision is made, create/append an **ADR** (see §6).
* When a new task emerges, add it to `tasks.md` immediately with due/priority.

### C) End-of-Session Checklist (must do)

1. **Summarize**: fill “Summary/Decisions/Next 1–3 actions” in the note.
2. **Update backlog**: reflect completed work, add follow-ups, set owners/dates.
3. **Update state.yaml**: `last_session_at`, `next_entry_point`, `pins`.
4. **Commit** `.memory/**` changes with a clear message:

   * `chore(memory): update tasks & state for {YYYY‑MM‑DD}`
5. Leave a breadcrumb file `.memory/NEXT.md` with the top **3 next actions** (copy from the note).

---

## 4) Notes — Format & Template

**Location:** `.notes/`

**File name:** `YYYY‑MM‑DD_HHMM‑TZ.md` (e.g., `2025‑08‑11_2210‑PDT.md`)

**Template**

```markdown
# Session {YYYY‑MM‑DD HH:MM TZ}

## Goal
<!-- One‑liner of what “done” looks like for this session. -->

## Summary (What changed)
- 

## Decisions (Why it changed)
- Decision: <statement>
- Context: <tradeoffs>
- Consequence: <what we accept>

## Next 1–3 Actions (Breadcrumbs)
1.
2.
3.

## Open Questions
- 

## Blockers
- 

## References / Links
- 
```

> **Rule of Three:** cap “Next Actions” at 3; defer everything else to `tasks.md`.

---

## 5) Tasks & Reminders (Backlog)

**Location:** `.memory/tasks.md` (committed)

**Format:** Markdown checkboxes; one task per line with tags:

```
- [ ] P1 2025-08-15 [infra] Migrate SEO plugin to v3  #id:T-2025-0811-01
- [ ] P2 2025-08-20 [docs] Draft Astro deploy guide     #id:T-2025-0811-02
- [x] P3 2025-08-10 [chore] Update .gitignore           #id:T-2025-0810-01
```

**Conventions**

* **Priority:** `P1` (urgent), `P2` (soon), `P3` (nice‑to‑have).
* **Due date:** ISO `YYYY‑MM‑DD`. If unknown, omit and add a tag `[triage]`.
* **ID:** Stable anchor `#id:` for cross‑referencing in notes/ADRs.
* **Owner:** When multi‑user, append ` @owner`.

**Overdue behavior**

* At session start, surface all unchecked tasks with due ≤ today.
* If still relevant, **snooze** by editing the date; otherwise **close** with a reason.

**Optional machine‑friendly mirror**

* Keep `.memory/state.yaml` with lightweight counters, last IDs, quick pins.

Example `state.yaml`:

```yaml
last_session_at: 2025-08-11T22:10:00-07:00
next_entry_point: "Finish Step 3 of SEO audit (#T-2025-0811-01)"
pins:
  - file: guides/astro_seo.md
  - file: .memory/tasks.md#line-12
counters:
  next_task_id: T-2025-0811-03
```

---

## 6) Decisions — ADRs

**Location:** `.memory/adr/`

**File name:** `YYYY‑MM‑DD‑short‑slug.md`

**Template**

```markdown
# Title (Decision)
Date: YYYY‑MM‑DD
Status: Accepted | Superseded by <ADR#> | Proposed

## Context
- What problem are we solving? What constraints exist?

## Decision
- The decision in one or two sentences.

## Consequences
- Positive and negative ramifications, trade‑offs, migrations required.

## Links
- Related PRs, issues, sessions, tasks (by #id)
```

---

## 7) Guides — Structure & Review

**Location:** `guides/`

**Naming:** `YYYY‑MM‑DD_descriptive-name.md`

**Front‑matter (recommended)**

```markdown
---
owner: @you
status: draft | published
last_reviewed: YYYY‑MM‑DD
summary: one‑sentence purpose
---
```

**Content checklist**

* Purpose → Prereqs → Steps → Verification → Troubleshooting → Links.
* Use fenced code blocks; prefer copy‑pasteable commands.
* Include a **Verification** section (how to know it worked).

**Template:** `guides/TEMPLATE.md` (copy, then fill sections).

**Validation before commit**

```bash
node scripts/validate_guides.mjs
```

* Fails on secret‑like tokens and other repo‑specific checks.
* Extendable to lint links, enforce front‑matter, etc.

---

## 8) Security & Secrets

* **Never commit secrets** (passwords, API keys, tokens, private URLs).
* Use environment managers (e.g., `.env.local`) stored **outside git** or via a secret manager.
* Redact tokens in notes: `sk_live_…` → `sk_live_****last4`.
* If a secret appears in working files, rotate it and force‑remove from history.

Suggested `scripts/validate_guides.mjs` checks:

* Regexes for common key patterns (AWS, OpenAI, GitHub tokens).
* Search for `BEGIN PRIVATE KEY` blocks.
* Flag accidental `.env` content.

Optional local pre‑commit hook (not versioned):

```
.githooks/pre-commit → node scripts/validate_guides.mjs
```

---

## 9) Git Hygiene

* Small, focused commits; prefix types: `feat|fix|docs|chore|refactor`.
* Reference tasks/ADRs by ID in commit body when relevant.
* Do **not** commit `.notes/**` or `.memory/private/**`.

---

## 10) Crash/Interruption Recovery

* On restart, open the most recent `.notes/*` and resume from **Next 1–3 Actions**.
* If the last note lacks a summary, create a retro‑summary before proceeding.

---

## 11) First‑Run Bootstrap (one‑time)

```bash
# create folders
mkdir -p .notes .memory/adr .memory/private guides scripts .githooks

# seed files
printf "# Tasks\n\n" > .memory/tasks.md
cat > .memory/state.yaml <<'YAML'
last_session_at: null
next_entry_point: null
pins: []
counters:
  next_task_id: T-0000-0000-00
YAML

# copy in guides/TEMPLATE.md and scripts/validate_guides.mjs per repo
```

---

## 12) Behavioral Rules for the LLM Agent

*   **Be explicit.** Write notes and tasks as if someone else will continue the work.
*   **Bias to structure.** Prefer checklists, numbered steps, and IDs.
*   **Cap next steps at 3.** Prevents thrash and preserves momentum.
*   **Surface risks early.** Log blockers and unknowns in the note/open questions.
*   **Leave breadcrumbs.** Always update `.memory/NEXT.md` at session end.

---

## 13) Examples (copy‑paste)

**Add a task**

```
echo "- [ ] P2 2025-08-20 [docs] Draft Astro SEO guide  #id:T-2025-0811-03" >> .memory/tasks.md
```

**Start a session**

```
note=".notes/$(date +%F_%H%M-%Z).md" && cp guides/TEMPLATE.md "$note" && sed -i '' "1s/.*/# Session $(date '+%F %R %Z')/" "$note" && $EDITOR "$note"
```

**Validate guides**

```
node scripts/validate_guides.mjs
```

---

### That’s it

These conventions make the agent predictable, auditable, and easy to hand off. If something isn’t covered, add a short guide or ADR so the rule lives in the repo, not just in your head.
