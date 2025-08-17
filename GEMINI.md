# CLI LLM Manual — Memory, Tasks & Quicknotes (Emoji‑First)

> Operating rules for a CLI‑enabled LLM that must **remember across sessions** and **take quick notes before every reply**.

---

## 1) Purpose & Scope

* Keep momentum across breaks and crashes by persisting **what changed, why, and what’s next**.
* Replace heavy session logs with a **fast, emoji‑dense running log**.
* Ensure secrets never land in git.

---

## 2) Directory Layout (authoritative)

```
.memory/                # Structured, committed state (except /private)
  tasks.md              # Human‑readable backlog with due dates/priorities
  state.yaml            # Machine state (last_note_at, note_file, next_entry_point, pins)
  adr/                  # Architecture Decision Records (ADRs)
  private/              # Local-only notes (gitignored)
    note-YYYY-MM-DD_HHMM-TZ.md  # Running quicknotes for a session (append-only)

guides/                 # How‑tos, runbooks, checklists
  TEMPLATE.md

scripts/                # Repo scripts (e.g., validator)
  validate_guides.mjs

.githooks/              # Local git hooks (optional)
```

**Git policy**

* Commit `.memory/*` **except** `.memory/private/**`.
* Do **not** use a separate `.notes/` directory.

Recommended `.gitignore` additions:

```
# private memory and local artefacts
.memory/private/
.env*
.DS_Store
```

---

## 3) Interaction Loop (hard rule)

**Before returning ANY response to the user, the LLM MUST append a quicknote.**

Checklist executed **every time** before replying:

1. **Time check:** compute `elapsed = now - state.last_note_at` (fallback: `0m`).
2. **Select note file:** use `state.note_file` if set and `elapsed < SESSION_ROLL_MIN` (default 20m). Otherwise, create a new file named `note-YYYY-MM-DD_HHMM-TZ.md` in `.memory/private/` and set `state.note_file`.
3. **Append quicknote** line to that file using the schema in §4.
4. **Update tasks** in `.memory/tasks.md` for any new todos or completions mentioned.
5. **Update state** in `.memory/state.yaml`: `last_note_at`, `note_file`, `next_entry_point` (if clear), and any refreshed `pins`.
6. **(Optional)** If there are exactly 1–3 concrete next steps, mirror them to `.memory/NEXT.md`.

> If truly nothing changed, write a **heartbeat** quicknote (see §4) so we still get a timestamped breadcrumb.

---

## 4) Quicknotes — Running, Emoji‑Dense Log

**Location:** `.memory/private/note-YYYY-MM-DD_HHMM-TZ.md` (append‑only per session)

**Style:** One line per entry, ultra‑concise, emoji labels carry meaning. Prefer < 200 chars.

**Schema (fields are optional; include only what applies):**

```
- {YYYY-MM-DD HH:MM TZ} ⏱️+{Xm} | 🧠 {lesson} | 🐛 {bug} | 🔧 {fix/how} | ✅ {done} | 🔜 {next 1–3} | 🧭 {decision} | 🚧 {blocker} | ⚠️ {risk} | 🧪 {test} | 📎 {refs}
```

**Emoji legend**

* 🧠 lesson learned
* 🐛 bug found
* 🔧 fix/how we fixed it
* ✅ done/verified
* 🔜 next actions (max 3)
* 🧭 decision made
* 🚧 blocker
* ⚠️ risk
* 🧪 test/verification
* 📎 refs/links/IDs
* ⏱️ minutes since previous note
* 🫀 heartbeat (no change)
* 📌 pin (important file/line)

**Examples**

```
- 2025-08-16 19:05 PDT ⏱️+7m | 🐛 SEO build loops | 🔧 pinned vite dep=5.4 | 🧪 build ok | ✅ guide compiles | 🔜 ship #T-2025-0816-01 | 📎 PR#42
- 2025-08-16 19:12 PDT ⏱️+7m | 🧠 “astro check” catches tsconfig drift | 🔜 add to CI
- 2025-08-16 19:15 PDT ⏱️+3m | 🫀 heartbeat (reviewed issues; no change)
```

---

## 5) Tasks & Reminders (Backlog)

**Location:** `.memory/tasks.md` (committed)

**Format:** Markdown checkboxes; one task per line with tags/IDs:

```
- [ ] P1 2025-08-20 [infra] Upgrade vite to 5.4  #id:T-2025-0816-01
- [ ] P2 2025-08-22 [docs] Add “astro check” to CI #id:T-2025-0816-02
- [x] P3 2025-08-16 [chore] Update .gitignore       #id:T-2025-0816-03
```

**Conventions**

* **Priority:** `P1` urgent, `P2` soon, `P3` nice‑to‑have.
* **Due date:** ISO `YYYY‑MM‑DD` when known; else tag `[triage]`.
* **ID:** Stable `#id:` for references in notes/ADRs/commits.
* **Owner:** Append ` @owner` in multi‑user repos.

**Overdue behavior**

* During the first reply of a session, surface all unchecked tasks due ≤ today; propose snooze/close.

**Machine mirror** (lightweight, optional): keep key pointers in `state.yaml`.

Example `state.yaml`:

```yaml
last_note_at: 2025-08-16T19:15:00-07:00
note_file: .memory/private/note-2025-08-16_1915-PDT.md
next_entry_point: "Release vite upgrade (#T-2025-0816-01)"
pins:
  - file: guides/astro_build.md
  - file: .memory/tasks.md#line-2
counters:
  next_task_id: T-2025-0816-04
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
- Problem + constraints

## Decision
- The decision in one or two sentences

## Consequences
- Positive/negative trade‑offs; migrations

## Links
- PRs, issues, tasks (#id), related quicknotes timestamps
```

---

## 7) Guides — Structure & Review (industry‑aligned)

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

**Doc types (keep separate)**

* **Tutorials** — step‑by‑step learning paths; one outcome; assume zero prior knowledge.
* **How‑to guides** — precise task recipes for users “at work”; short, pragmatic.
* **Reference** — complete, accurate description of APIs/CLI/config; no narrative.
* **Explanation** — background, rationale, design, and trade‑offs.

**Content checklist (concise)**

* **Each doc**: clear scope/non‑scope at top; prerequisites; steps with copy‑paste blocks; verification checks; troubleshooting; links.
* **README baseline**: problem statement, quickstart, minimal example, install, usage, config, support/issue links, license, contributing.
* **Style**: second person, present tense, active voice; consistent terminology; code‑first examples; keep one purpose per doc.

**Template:** `guides/TEMPLATE.md`

**Validation**

```bash
node scripts/validate_guides.mjs
```

* Fails on secret‑like tokens; extensible for link linting & front‑matter.

---

## 8) Security & Secrets

* **Never commit secrets** (passwords, API keys, tokens, private URLs).
* Keep secrets in `.env.local` or a secret manager; redact in quicknotes: `sk_live_…` → `sk_live_****last4`.
* If a secret leaks, rotate and purge from history.

Suggested validator checks:

* Regexes for AWS/OpenAI/GitHub tokens, `BEGIN PRIVATE KEY` blocks, `.env` patterns.

Optional local pre‑commit hook (not versioned):

```
.githooks/pre-commit → node scripts/validate_guides.mjs
```

---

## 9) Git Hygiene

### 9.1) Conventional Commits

A specification for adding human and machine readable meaning to commit messages. It provides an easy set of rules for creating an explicit commit history, which makes it easier to write automated tools on top of. This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages.

**Structure:**
`<type>[optional scope]: <description>`
`[optional body]`
`[optional footer(s)]`

**Key Elements:**
*   **`type`**: A noun like `feat` (new feature, MINOR in SemVer), `fix` (bug fix, PATCH in SemVer), etc.
*   **`scope` (optional)**: A noun describing a section of the codebase, e.g., `feat(parser):`.
*   **`description`**: A short summary of the code changes.
*   **`body` (optional)**: A longer, free-form description.
*   **`footer(s)` (optional)**: Can include `BREAKING CHANGE:` or other metadata.
*   **`BREAKING CHANGE`**: Indicated by `BREAKING CHANGE:` in a footer or `!` after type/scope. Correlates with MAJOR in SemVer.

**Rules (concise):**
*   Commits MUST be prefixed with a `type`, followed by `OPTIONAL scope`, `OPTIONAL !`, and `REQUIRED :<space>`.
*   `feat` MUST be used for new features.
*   `fix` MUST be used for bug fixes.
*   `description` MUST immediately follow the colon and space.
*   `body` MAY be provided one blank line after the description.
*   `footers` MAY be provided one blank line after the body.
*   `BREAKING CHANGE` MUST be indicated in the type/scope prefix (with `!`) or as a footer.
*   Types other than `feat` and `fix` MAY be used (e.g., `docs`, `chore`, `refactor`).

* Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages.
* Small, focused commits; prefix types: `feat|fix|docs|chore|refactor`.
* Reference tasks/ADRs by ID in commit bodies when relevant.
* Do **not** commit `.memory/private/**`.

---

## 10) Crash/Interruption Recovery

* On restart, open the most recent `.memory/private/note-*.md`, read the last 3 entries, and resume from the most recent `🔜` or `📌`.
* If the last entries lack `🔜`, create a new quicknote with next 1–3.

---

## 11) First‑Run Bootstrap (one‑time)

```bash
# create folders
mkdir -p .memory/adr .memory/private guides scripts .githooks

# seed files
printf "# Tasksnn" > .memory/tasks.md
cat > .memory/state.yaml <<'YAML'
last_note_at: null
note_file: null
next_entry_point: null
pins: []
counters:
  next_task_id: T-0000-0000-00
YAML
```

---

## 12) Behavioral Rules for the LLM Agent

* **Always note before reply.** A quicknote precedes every message back to the user.
* **Bias to emojis.** Emojis compress meaning (🧠🐛🔧✅🔜📎); keep text lean.
* **Cap next steps at 3.** Prevents thrash; overflow goes to `tasks.md`.
* **Make fixes reproducible.** Include the essence of “how” in `🔧` and verification in `🧪`.
* **Leave breadcrumbs.** Keep `next_entry_point` and `note_file` up to date and pin key files.

---

## 13) Snippets (copy‑paste)

**Append a quicknote (POSIX sh)**

```sh
TS="$(date '+%F %R %Z')"
NOTE_FILE=".memory/private/note-$(date '+%F_%H%M-%Z').md"
ELAPSED_MIN=0
# Optionally compute ELAPSED_MIN from .memory/state.yaml in your environment
printf -- "- %s ⏱️+%sm | 🧠 lesson:… | 🐛 … | 🔧 … | ✅ … | 🔜 … | 📎 …n" "$TS" "$ELAPSED_MIN" >> "$NOTE_FILE"
```

**Mark a task done**

```sh
sed -i'' -e 's/^(- [ ] .*#id:T-2025-0816-01)$/[x] 1/' .memory/tasks.md
```

**Validate guides**

```sh
node scripts/validate_guides.mjs
```

---

### That’s it

Timestamped `note-*.md` files + mandatory pre‑reply quicknotes give you fast, searchable memory with minimal overhead—and the emojis carry the load. 🛡️⚔️