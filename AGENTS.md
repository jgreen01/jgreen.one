# AGENTS.md

Shared guidance for coding agents working on **jgreen.one** (Jon Green's personal website — Astro static site deployed to AWS).

Two working systems: session notes go to `~/.session-notes/`; larger tasks live in `todo/`.

## 🛑🛑🛑 CRITICAL GIT POLICY — READ THIS FIRST 🛑🛑🛑

> # ⛔ NEVER `git commit` OR `git push` UNTIL JON EXPLICITLY SAYS SO. ⛔
>
> **This is an absolute, non-negotiable, no-exceptions rule.** There is no situation
> in which you may commit or push on your own initiative. Not to "finish up," not to
> "save progress," not because the work is obviously done, not because it seems safe,
> not because a previous task ended with a commit. **If in doubt, DO NOT COMMIT.**

**The ONLY trigger** is Jon stating, in the current request, an explicit instruction
to commit or push (e.g. "commit this", "commit and push", "push it"). Anything less —
silence, approval of the work itself, "looks good", "thanks" — is **NOT** permission.

- After completing work: summarize the changes, then **STOP**. Stage nothing. Wait.
- Do **not** run `git commit`, `git push`, `git commit --amend`, or any committing
  command speculatively or "to be helpful."
- Permission is **single-use**: it applies to that one commit/push only. The next
  change requires a fresh, explicit go-ahead.
- When Jon *does* ask: read the full `git diff --cached`, scan for blockers (secrets,
  debug output, conflict markers, files that shouldn't be committed), and draft the
  message from the actual diff — never from `--stat` alone.

🛑 If you are about to type `git commit` or `git push` and Jon did not explicitly ask
in this turn — **STOP. You are violating the policy.** 🛑

### Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `<type>[optional scope]: <description>`.

- `feat` (new feature), `fix` (bug fix); also `docs`, `chore`, `refactor`, `style`. Scope is a codebase area, e.g. `feat(seo):`, `style(EntryCard):`.
- Description follows the colon + space; optional body one blank line later; breaking changes use `!` after type/scope or a `BREAKING CHANGE:` footer.
- Keep commits small and focused.

## Session Notes

Write detailed, permanent session logs to `~/.session-notes/`. Notes must be complete enough that if the user forgot everything, they could read them and immediately resume.

**Location:** Always `~/.session-notes/YYYY-MM-DD-[topic].md`. Never use a project-local `.session-notes/` folder. Use descriptive topic names (prefix project ones with `jgreen-one-`).
**Append-only.** Never edit, overwrite, or delete existing content.
**No secrets.** Never include tokens, passwords, connection strings, or private keys.

### Process
1. **Always run `date "+%Y-%m-%d"` first** — use it for the filename. Never assume the date from conversation context.
2. Determine filename: `~/.session-notes/YYYY-MM-DD-jgreen-one-[topic].md`
3. If the file is new, create it with a header: `# Session: YYYY-MM-DD — [Topic]` (date only).
4. Append entries in the format below.

### What to Capture
- 💻 Exact commands run
- 📤 Output / results seen
- ✅ What worked
- ❌ What failed
- 💡 Decisions made
- 🗂️ System state
- ⚠️ Gotchas
- ➡️ Next steps

## TODO Task Management

Larger tasks are tracked as files in `todo/` (see `todo/README.md`):
- `todo/TODO-INDEX.md` — master index, grouped by HIGH/MEDIUM/LOW.
- `todo/TEMPLATE-task.md` — copy this for new tasks.
- `todo/done/` — completed tasks filed away for reference (see below).
- `todo/boneyard/` — abandoned tasks with reasons.

Task IDs use bare base36 (no padding, no prefix): `1`, `2`… `9`, `A`, `B`… `Z`, `10`… Filename: `<id>-<slug>.md`. Reference tasks as "task 1", "task A", etc. Assign the next sequential ID when creating a task; never reuse a retired ID.

Update each task's **Status** and **Log** as work progresses. When done, mark it `DONE` and move it to "Recently Resolved" in the index — the file stays in `todo/`. If abandoned, move the file to `boneyard/` with a reason.

**Done folder rule:** Never move a task to `todo/done/` unless Jon explicitly asks (e.g. "move task 1 to done"). Completing a task is not permission to file it. Tasks remain in `todo/` marked DONE until Jon says to file them. See `todo/done/README.md` for the exact steps.

## Commands

```bash
npm install                 # install dependencies
npm run dev                 # dev server at http://localhost:4321
npm run build               # build to ./dist
npm run preview             # preview the production build
./scripts/deploy.sh         # build + sync to S3 + invalidate CloudFront (reads Terraform outputs)
node scripts/validate_guides.mjs   # validate guides / scan for secrets

# Infrastructure (Terraform)
cd infra/live && terraform plan     # preview infra changes
cd infra/live && terraform apply    # apply infra changes
```

## Architecture

- **Frontend:** Astro 5 + Tailwind CSS v4 (via `@tailwindcss/vite`) + TypeScript. Integrations: sitemap, mdx, astro-favicons; Markdown uses remark-gfm.
- **Content:** a single Astro content collection `entries` (`src/content/config.ts`). Blog posts AND projects both live in `src/content/entries/` as `.md`, distinguished by the `kind` field (`blog` | `project`). Drafts (`draft: true`) are filtered out of builds.
- **Layouts/pages:** `Base` → `PageLayout` / `ArticleLayout`. Routes include `/`, `/about`, `/contact`, `/blog`, `/projects`, `/entries`, `/entries/[slug]`, `/tags`, `/tags/[tag]`, `/404`.
- **Infra (Terraform in `infra/`):** S3 (private, OAC, encryption, versioning) + CloudFront (PriceClass_100, `function.js` for clean-URL rewrites) + ACM (us-east-1) + Route 53. `bootstrap/` sets up the state backend; `live/` is the production stack.
- **Deploy:** `scripts/deploy.sh` pulls Terraform outputs, runs `npm ci && npm run build`, `aws s3 sync ./dist --delete`, then a CloudFront `/*` invalidation.

## Repository Layout & Change Scope

- Review the repository structure before assumption-heavy changes.
- Prefer minimal, localized edits within the area relevant to the current task.
- Preserve existing structure, naming, and design tokens unless the task requires otherwise.
- Treat `astro.config.mjs`, `tailwind.config.mjs`, and `infra/` as cross-cutting; change them only when the task requires it.

## Environment & Secrets

- AWS account: 575352938041. The CLI/credentials must be working before any `terraform`/`aws`/`deploy.sh` command.
- Never commit secrets or write real secret values into Terraform; use placeholders (e.g. the billing-alert email) and let the user fill them in.
- `*.tfstate`, `.terraform/`, and `.env*` are gitignored — keep it that way.
- Redact any secret that must appear in notes or output: `sk_live_…` → `sk_live_****last4`.
- If a secret leaks into git, rotate it immediately and purge it from history.

## Guides

How-tos, runbooks, and reference docs live in `guides/` (template: `guides/TEMPLATE.md`).

- **Naming:** `descriptive-name.md`. Put the date in the front-matter. Optional front-matter: `owner`, `status` (draft|published), `created`, `last_reviewed`, `summary`.
- **Keep doc types separate:** tutorials (learning paths), how-to guides (task recipes), reference (complete API/CLI/config description), explanation (rationale/trade-offs).
- **Each doc:** scope/non-scope up top, prerequisites, copy-paste steps, verification checks, troubleshooting, links. Second person, present tense, active voice; code-first examples; one purpose per doc.
- **Validate before committing:** `node scripts/validate_guides.mjs` (fails on secret-like tokens; extensible for link/front-matter linting). Optionally wire it into `.githooks/pre-commit`.

## Testing & TDD

This project should be developed test-first. The rules below are adapted from a more mature testing setup and apply to any non-trivial logic (content utilities, the `entries` collection helpers, tag aggregation, SVG/Avatar parsing, build/deploy wrappers, and future `/_llm/*` endpoints).

**TDD cycle — always in this order:**
1. Write a failing test that defines the expected behavior (RED).
2. Write the minimum code to make it pass (GREEN).
3. Refactor without breaking tests (REFACTOR).

Never write implementation first. If you find yourself writing code before a test exists, stop and write the test.

**Tests must be hermetic — no live external calls.**
- Never hit the network, AWS (S3/CloudFront/Route 53), or run `scripts/deploy.sh` / `terraform apply` from a test.
- Never read or write real `dist/`, `public/`, or live `src/content/entries/` data. Use fixtures and temp dirs so tests are deterministic and order-independent.
- For content-collection logic, feed in fixture markdown/frontmatter — don't depend on whatever happens to be in `src/content/` today.

**Mock external commands; assert exact args; assert invariants.**
- When testing anything that shells out (the deploy/build wrapper, AWS CLI calls), mock the call, assert the exact arguments, and assert safety invariants — e.g. no secret, env value, or credential ever appears in a command or in built output.

**Recorded fixtures, never arbitrary mocks.** If a test needs external data (an API/build response), capture a real response once into `tests/fixtures/<area>_<case>.json` and inject it through a thin shim. Don't return arbitrary hand-written strings from a mock — arbitrary values hide real bugs.

**Keep slow tests out of the default run.** Fast unit tests run by default; gate slow integration tests (a full `astro build`, anything touching the filesystem heavily) behind a separate script or test tag so the inner loop stays quick.

**Verify, don't trust.** Don't take a reported "tests pass" at face value:
1. Run the tests yourself and confirm the count and pass rate.
2. Read at least one implementation file and spot-check it actually does what the test asserts (no hardcoded hacks matching the assertion).
3. For complex logic, read the whole implementation — that's where a plausible-looking version is subtly wrong in ways the test shares the same wrong assumption about.

**Manual smoke test after changes.** Tests pass in isolation; real bugs surface when the full stack runs. After any meaningful change, run `npm run build` + `astro check`, then load `npm run dev` (or `npm run preview`) and eyeball the affected page — correct render, no console errors, links work.

**Setup (not yet installed).** No test runner is wired up yet. The standard fit for this Astro/Vite stack is **Vitest**:
```bash
npm i -D vitest
# package.json scripts:
#   "test": "vitest run",          # fast unit tests, default loop
#   "test:watch": "vitest",
#   "test:build": "astro build"    # integration smoke (slow, opt-in)
```
Put unit tests next to the code (`*.test.ts`) or under `tests/` with fixtures in `tests/fixtures/`. Use `astro check` for type-level coverage.

## Validation

- After editing site code, run `npm run build` (and `astro check`) to confirm it compiles and type-checks.
- After editing Terraform, run `terraform plan` in `infra/live` and show the plan before applying.
- Run the test suite (`npm run test`, once set up) and follow the **Verify, don't trust** rule above.
- If something can't be validated locally, say so clearly before asking to continue.
