# RUNBOOK — continuing a /plan-code project with any agent

This repo was planned with Min using Claude's `/plan-code` and is built one **work package**
(WP) at a time. When Claude or Codex runs out of usage, any capable coding agent can continue
by following this file. Read `.plan-code/HANDOFF.md` right after this — it says exactly where
work stopped.

## Ground rules (every agent)

1. Read `AGENTS.md` (repo rules and commands) and `.plan-code/HANDOFF.md` first.
2. Work on **one WP at a time**, only inside its brief's *In scope* paths.
3. Never change contracts listed in `AGENTS.md` or the brief unless the brief says so.
4. Never commit secrets, never `git push`, deploy, publish or delete data. Commits on the
   current branch are fine once checks pass.
5. Major ambiguity (data model, contracts, user-visible behaviour, security, cost) → stop and
   record the question; don't guess.
6. Before you stop for any reason, record the stopping point (step 6 below). It takes one command.

## Loop

1. **Find the WP.** HANDOFF → *Work package* and *Next step*. If the current WP is done, take
   the next unchecked `WP-xx` in the build plan (listed in HANDOFF).
2. **Brief.** Use `.plan-code/briefs/WP-xx.md`. If it doesn't exist yet, write it from the build
   plan entry following the template in the brief files that do exist (Goal, Context, Do,
   Scope, Acceptance criteria, Verify with, Report).
3. **Implement** — either yourself, or by running an engine:
   `python <kit>/scripts/run_wp.py --repo . --wp WP-xx --engine <codex|codex-oss|agy|opencode>`
   (exact command lines are in HANDOFF).
4. **Verify** — run every command under *Verify with* in the brief plus the repo's test command.
   Check each acceptance criterion has evidence (a passing test, code, command output).
   Check `git diff --stat` for files outside scope. Any failure → fix (max 2 attempts) or stop
   with the findings recorded.
5. **Commit** when everything passes: `git add -A && git commit -m "WP-xx: <title>"`.
6. **Record** (always — after each WP, and before stopping):
   ```bash
   python <kit>/scripts/checkpoint.py save --wp WP-xx --wp-status done --status running --next "<next WP or action>"
   # stopping instead:
   python <kit>/scripts/checkpoint.py save --status stopped --reason engine-limit --note "<what happened>" --next "<exact next action>"
   ```
   This updates HANDOFF, the vault hub note and the Coding Index.
7. **Work log** — append to the vault note `Coding/<Project>/Work Log/<YYYY-MM-DD>.md`:
   ```markdown
   ## WP-xx <title> — ✅ PASS  (<HH:mm>)
   - **Agent:** <tool + model, e.g. Antigravity CLI / Gemini Flash>
   - **What changed:** …
   - **Files:** …
   - **Verification:** <commands + results>
   - **Deviations / follow-ups:** …
   - **Commit:** <hash>
   ```
   and tick the WP in `Coding/<Project>/06 Build Plan.md` (`- [x] … ✅ YYYY-MM-DD`).
   Mark the entry with the agent/model used, so Claude can re-review non-Claude/Codex work later.

`<kit>` is the plan-code skill folder, normally `%USERPROFILE%\.claude\skills\plan-code`.

## What free/fallback agents should NOT do

- Re-plan the project, change the stack, or rewrite finished WPs.
- Edit `01`–`05` plan notes in the vault (only the Work Log, the Build Plan checkboxes and HANDOFF via checkpoint.py).
- Resolve Major questions themselves — record them for Min and Claude.
