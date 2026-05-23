<!--
This template mirrors the PR description required by CONTRIBUTING.md and
the "Working with this repo as an agent" rules in AGENTS.md. Fill in every
section; reviewers will use it as a checklist.

Do **not** delete the <!-- prefill:… --> HTML comments; `scripts/gh-pr.sh`
fills the blocks between paired start/end comments when you draft a PR
locally.

Title: Conventional Commits, with the ticket id.
  feat(backend): add /api/route caching (M1-F04)
  fix(web): focus trap loop in profile panel (M1-F06)
  chore(meta): add GitHub issue templates (M1-T10)
-->

## Summary

<!-- 1–3 sentences. What changed and why. -->
<!-- prefill:summary:start -->
-
<!-- prefill:summary:end -->

## Tickets closed

<!--
Cite at least one. Use IDs from docs/02-prd.md (M{n}-F{nn}), the
scaffolding importer (M{n}-T{nn}), docs/03-decisions.md (DEC-NNN), or
open questions (OQ-NN).
-->
<!-- prefill:tickets:start -->
-
<!-- prefill:tickets:end -->

## Decisions touched

<!--
DEC-NNN references, if any. Reminder (AGENTS.md rule #4): you cannot
silently reverse a decision. If one needs to change, open
docs/proposals/DEC-NNN-followup.md and wait for sign-off.
-->
<!-- prefill:decisions:start -->
-
<!-- prefill:decisions:end -->

## Tests added or changed

<!--
What new tests cover the behavior. Cite paths. If you changed an existing
test, explain why — and confirm you did not weaken it (AGENTS.md rule #2).
-->
<!-- prefill:tests:start -->
-
<!-- prefill:tests:end -->

## Screenshots

<!--
UI changes only. Include light + dark and focus + hover states where
relevant. Axe report attachments are welcome for a11y-touching work.
-->

## Out of scope

<!-- Things you noticed but intentionally did not touch in this PR. -->

- ***

## Author checklist

- [ ] PR title uses Conventional Commits and cites the ticket id.
- [ ] **New dependency?** I added the one-sentence justification (what
      need, what was rejected, why this) and ran the local security scan
      (`pip-audit` for Python, `npm audit --omit=dev` for Node). See
      AGENTS.md "Dependency policy".
- [ ] **Data-schema change?** I updated `docs/appendix-data-schema.md`,
      the PRD §9.2 DDL, and added an Alembic migration in this PR.
- [ ] **Closed an `OQ-NN`?** I marked it RESOLVED in `docs/02-prd.md` §10
      with a pointer to this PR.
- [ ] I ran the local equivalents of CI. (Workflow gating is pending
      `M1-T05`; once it lands this becomes "CI is green.")
