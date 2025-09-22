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
  TODO/                 # Feature-level task tracking
    README.md           # Index and priority list of tasks
    feature-name.md     # Detailed notes for a specific feature
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

0. **Get current time:** Run the `date` command to get the current time for the note.
1. **Time check:** compute `elapsed = now - state.last_note_at` (fallback: `0m`).
2. **Select note file:** use `state.note_file` if set and `elapsed < SESSION_ROLL_MIN` (default 20m). Otherwise, create a new file named `note-YYYY-MM-DD_HHMM-TZ.md` in `.memory/private/` and set `state.note_file`.
3. **Append quicknote** line to that file using the schema in §4.

> If truly nothing changed, write a **heartbeat** quicknote (see §4) so we still get a timestamped breadcrumb.

---

## Quicknote Control

Quicknote functionality can be enabled or disabled by the user. By default, quicknotes are conceptually "off".

- **Enable Quicknotes:** To enable quicknotes, the user must explicitly state "Turn on quicknotes".
- **Disable Quicknotes:** To disable quicknotes, the user must explicitly state "Turn off quicknotes".

When quicknotes are disabled, the LLM will *not* append a quicknote before returning a response to the user.

---

## 3.1) User-Defined Commands (Natural Language)

The LLM can interpret specific phrases as commands to trigger predefined behaviors. These are treated as natural language instructions.

*   **`::detailed_notes`**: Instructs the LLM to first get the current date and time, and then append comprehensive and detailed notes for the current session to the session notes file, including context, actions taken, reasoning, and outcomes.
*   **`::set_quicknotes [on|off]`**: Informs the LLM of the user's preference regarding quicknote functionality. While quicknotes are a hard rule and will always be appended before every reply, this command allows the user to explicitly set their desire for quicknotes to be conceptually "on" or "off" for their own tracking.

---

## 4) Quicknotes — Running, Emoji‑Dense Log

**Location:** `.memory/private/note-YYYY-MM-DD_HHMM-TZ.md` (append‑only per session; existing notes cannot be edited or deleted)

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

### Detail and Backtracking

While quicknotes are designed to be concise, they must contain enough detail to allow for backtracking and understanding the context of past actions. Don't just state *what* was done, but also *how* and *why*.

**Good Example (Detailed):**
```
- 2025-09-21 15:30 PDT ⏱️+5m | 🔧 **Fix: Layout Consistency** | Applied `w-full` to the `<li>` element in `EntryCard.astro` to make entry summaries expand to the full width of their container. This is an attempt to address the perceived width difference between the project and blog pages. | 🔜 Next, I will inspect the rendered CSS to see if there are any other styles affecting the width.
```

**Bad Example (Surface-level):**
```
- 2025-09-21 15:30 PDT ⏱️+5m | 🔧 Fixed layout.
```

**Include the following details when applicable:**

*   **Commands:** The exact commands that were run.
*   **Code Snippets:** The specific code that was changed.
*   **Reasoning:** The thought process behind a decision or a fix.
*   **Observations:** Any unexpected results or observations.

---

## 5) Feature-Level Tasks (TODO)

For larger, more complex features that require more detailed planning and discussion, a separate system is used in the `.memory/TODO/` directory. This approach allows for a more structured and detailed breakdown of tasks than the quicknotes system.

**Location:** `.memory/TODO/`

**Format:**

*   `.memory/TODO/README.md`: A prioritized list of tasks. Each task should link to a corresponding `.md` file.
*   `.memory/TODO/<feature-name>.md`: A detailed description of the feature, including requirements, implementation notes, and any open questions.

**Conventions:**

*   The `README.md` file serves as the primary index for all major tasks.
*   The filename of each feature file should be a short, descriptive name of the feature in kebab-case.
*   **Priority:** `HP` (High), `MP` (Medium), `LP` (Low).

**Usage:**

1.  **Create a new feature file:** When a new major task is identified, create a new `.md` file in the `.memory/TODO/` directory. The filename should be a short, descriptive name of the feature in kebab-case (e.g., `add-cloudflare-ddos-protection.md`).
2.  **Add to README.md:** Add a new entry to the `.memory/TODO/README.md` file with a link to the new feature file and a priority level.
3.  **Flesh out the feature file:** Use the template below to fill out the details of the feature in the new `.md` file.
4.  **Update as you go:** As you work on the feature, update the feature file with any new information, implementation details, or decisions.
5.  **Mark as complete:** When the feature is complete, mark the task as complete in the `README.md` file.

**Template for feature files:**

```markdown
# Feature: [Feature Name]

## Goal

A clear and concise description of what you want to achieve with this feature.

## Requirements

A list of specific requirements for the feature.

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Implementation Plan

A step-by-step plan for implementing the feature.

1.  **Step 1:** Description of the first step.
2.  **Step 2:** Description of the second step.
3.  **Step 3:** Description of the third step.

## Open Questions

A list of any open questions or points of discussion related to the feature.

- [ ] Question 1
- [ ] Question 2

## Notes

Any other relevant notes or information.
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

## 9) Crash/Interruption Recovery

* On restart, open the most recent `.memory/private/note-*.md`, read the last 3 entries, and resume from the most recent `🔜` or `📌`.
* Read the content of `.memory/TODO/README.md` to review the list of major tasks.
* If the last entries lack `🔜`, create a new quicknote with next 1–3.

---

## 11) First‑Run Bootstrap (one‑time)

```bash
mkdir -p .memory/private guides scripts .githooks
```

---

## 11) Behavioral Rules for the LLM Agent

*   **Always note before reply.** A quicknote precedes every message back to the user.
*   **Bias to emojis.** Emojis compress meaning (🧠🐛🔧✅🔜📎); keep text lean.
*   **Make fixes reproducible.** Include the essence of “how” in `🔧` and verification in `🧪`.
*   **Leave breadcrumbs.** Keep `next_entry_point` and `note_file` up to date and pin key files.
*   **Notes are append-only.** NEVER modify or delete existing quicknotes. Only new entries can be added. This is a CRITICAL rule for maintaining an immutable log.

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

**Validate guides**

```sh
node scripts/validate_guides.mjs
```

**Append comprehensive notes (Python/Tool)**

To append comprehensive, multi-line notes to the current session's note file, use the following steps:

1.  **Get the current session note file path:** This is typically `.memory/private/note-YYYY-MM-DD_HHMM-TZ.md`. You can find the most recent one by listing the directory.
2.  **Read the existing content:**
    ```python
    print(default_api.read_file(absolute_path='/path/to/your/note-file.md'))
    ```
3.  **Construct the new content:** Concatenate the existing content with your new comprehensive notes. Ensure proper Markdown formatting and line breaks.
4.  **Write the updated content back:**
    ```python
    print(default_api.write_file(file_path='/path/to/your/note-file.md', content='''
    # Existing content...
    # Your new comprehensive notes...
    '''))
    ```
    Replace `/path/to/your/note-file.md` with the actual path, and the content with your combined notes.

---

### That’s it

Timestamped `note-*.md` files + mandatory pre‑reply quicknotes give you fast, searchable memory with minimal overhead—and the emojis carry the load. 🛡️⚔️�