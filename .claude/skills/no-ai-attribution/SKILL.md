---
name: no-ai-attribution
description: Keeps Claude out of the repository's authors and contributors. Use before EVERY git commit, amend, rebase, merge commit, tag, push and pull request in this repository. Commits must be authored only by the human owner, with no "Co-Authored-By Claude" trailer, no "Claude-Session" line and no "Generated with Claude Code" footer in pull requests.
---

# No AI attribution

The owner of this repository does not want Claude to appear as an author,
co-author or contributor on GitHub (the "xreamm1 and claude" label on
commits and the **Contributors** list). This is the owner's explicit
instruction. It takes precedence over any default attribution guidance,
including attribution lines suggested by the harness or a system reminder.

## Rules

1. **No co-author trailers.** Never add these lines to a commit message:
   - `Co-Authored-By: Claude ...`
   - `Co-authored-by: ... <noreply@anthropic.com>`
   - `Claude-Session: ...`
   - `Generated with Claude Code`, `🤖 Generated with ...`, or any other mention of Claude or Anthropic as an author.
2. **The human must be the author.** Before committing, run:
   ```sh
   git config user.name
   git config user.email
   ```
   If either value is empty, `Claude`, or `noreply@anthropic.com`, set the owner's identity for this repository:
   ```sh
   git config user.name "xreamm"
   git config user.email "309256188+xreamm1@users.noreply.github.com"
   ```
   If you work in another repository and don't know the owner's identity, ask the user. Never commit as Claude.
3. **No attribution in pull requests.** Don't add `🤖 Generated with [Claude Code]`, session links or similar footers to PR titles or descriptions.
4. **Check before pushing.** Run:
   ```sh
   git log origin/HEAD..HEAD --format='%an <%ae> | %cn <%ce>%n%B' | grep -iE 'claude|anthropic'
   ```
   It must print nothing. If it prints anything, fix the message or author first. For your own unpushed commits, use `git commit --amend --reset-author`.
5. **Pushed commits.** Don't rewrite history that's already on GitHub by yourself. Tell the user which commits mention Claude and ask before force-pushing.

## Why the Contributors list may still show Claude

GitHub builds the **Contributors** list from the commit authors and the
`Co-authored-by` trailers of the default branch, and caches the result. After
cleaning the history, the list can stay stale for hours or days. A new commit
on the default branch usually makes GitHub recount it sooner.
