# Scaffolding-issue importer

A repeatable workflow for **drafting GitHub issues as local Markdown files,
then mass-importing them via `gh`**. Designed for batches like the M1 technical
scaffolding tickets, but reusable for any milestone or theme.

The Markdown files themselves are **transient** — once imported, the GitHub
issues are the source of truth and the local files should be deleted (this
directory typically only contains `README.md` + `import.sh` between batches).

---

## Quickstart (for humans)

1. Drop one Markdown file per issue into this directory, named
   `<TICKET-ID>-<short-slug>.md` and matching the **file format** below.
2. From this directory:

   ```bash
   chmod +x import.sh
   DRY_RUN=1 ./import.sh           # preview titles only, no GH writes
   ./import.sh                     # idempotent: creates labels + milestone + issues
   ```

3. Delete the imported files (e.g. `rm M1-[TF]*.md`) once you've verified
   they landed in GitHub. The README and the script stay.

**Overrides (env vars):**

| Var | Default | Purpose |
|---|---|---|
| `REPO` | `RSid/scout` | `owner/repo` form, must match `gh repo view` for the authed user |
| `MILESTONE_TITLE` | `M1` | Milestone to assign every issue to (created if absent) |
| `DRY_RUN` | `0` | When `1`, skips all GH writes — useful before a big batch |

**Idempotency.** Re-running the script:

- Skips labels and the milestone if they already exist.
- Skips issues whose **title exactly matches** an existing issue (state: any).
  Edit the title or close+rename the existing one to force a re-create.

---

## File format

Each issue is one Markdown file with **YAML frontmatter** followed by the
issue body. The script parses `title:` and `labels:` from frontmatter, then
posts everything after the closing `---` as the issue body.

```markdown
---
title: "M1-T07 — Add LICENSE (AGPL-3.0)"
labels: ["scaffold", "area:docs", "size:S", "good first issue"]
milestone: "M1"
---

## Context
Why this exists. Cite `docs/02-prd.md` sections, `DEC-NNN`, AGENTS rules.

## Acceptance criteria
- [ ] Concrete, testable bullets.
- [ ] One behavior per bullet.

## References
- `docs/03-decisions.md` — DEC-005
- `docs/02-prd.md` — NF-OSS-01

## Out of scope
- Anything that would balloon the ticket.
```

**Filename convention:** `<TICKET-ID>-<short-kebab-slug>.md`, e.g.
`M1-T07-license-agpl.md`. The script sorts files lexicographically and creates
issues in that order, so number your IDs zero-padded (`T07`, not `T7`).

**Frontmatter quirks the parser cares about:**

- `title:` must be on its own line, the value double-quoted.
- `labels:` must be on its own line, a single-line JSON-style array of
  double-quoted strings. No multi-line arrays.
- `milestone:` is read from the env var, not the frontmatter — the file can
  still document it for human readers.

---

## ID scheme

A convention this repo has adopted to keep traceability tight:

| Prefix | Meaning | Source of truth |
|---|---|---|
| `M{n}-F{nn}` | Product / user-story tickets (importer picks these up) | `docs/02-prd.md` §6 |
| `M{n}-T{nn}` | Tech / tooling / scaffolding tickets that the PRD doesn't break down | This importer + the GH issues it creates |
| `DEC-NNN` | Architectural decision | `docs/03-decisions.md` |
| `OQ-NN` | Open question | `docs/02-prd.md` §10 |

Commits and PRs cite the relevant ID per the Conventional Commits
convention in [`CONTRIBUTING.md`](../../../CONTRIBUTING.md), e.g.
`feat(infra): … (M1-T05)`.

---

## Reusing this workflow for a new batch (prompt for an agent)

Copy-paste-able prompt for the next time you want a staff-engineer agent
to repeat what was done for the M1 scaffolding wave:

> You are the technical lead. Read `AGENTS.md`, `docs/02-prd.md`, and
> `docs/03-decisions.md`. For **{MILESTONE}**, produce one Markdown file per
> issue in `docs/issues/scaffolding/`, following the format documented in
> that directory's `README.md`. Use either ID prefix as appropriate:
>
> - `M{n}-F{nn}` for product / user-story tickets (mirror the PRD's
>   §6 F-tickets one-for-one; reuse the PRD title verbatim).
> - `M{n}-T{nn}` for technical / tooling / scaffolding work the PRD doesn't
>   break down (atomic — one concern each).
>
> Each issue body focuses on **desired behavior**, not on implementation
> playbooks. Use this section order: **Context → Acceptance criteria →
> References → Out of scope**. Cite PRD sections, `DEC-NNN`s, and
> `AGENTS.md` rules where they shape the requirement. Avoid pointing the
> reader at `docs/prompts/*.md` in titles or acceptance criteria — those
> prompt files are implementation seeds for downstream agents, not contracts
> for the issue.
>
> Don't re-emit issues for already-tracked F-tickets or T-tickets;
> reference them instead.
>
> When the files are ready, ask the user before running `./import.sh`. After
> a successful import, delete the `M{n}-[TF]*.md` files but leave `README.md`
> and `import.sh` in place.

Tweak the milestone, ID prefix, and scope sentence as needed.

---

## Without `gh`

If a contributor doesn't have GitHub CLI installed:

1. Make sure labels referenced in the frontmatter exist in the repo.
2. Open **Issues → New issue** in the GitHub UI.
3. Copy the **body only** — everything after the closing `---` of the
   frontmatter — into the GitHub editor.
4. Manually paste the title, set labels and milestone to match frontmatter.

---

## Troubleshooting

- **`gh: Not Found (HTTP 404)` on `gh issue create`.** Usually means a label
  named in the file's frontmatter doesn't exist in the repo *and* the
  label-creation step didn't cover it. The current `import.sh` creates the
  full canonical label set up front; add any new label to the
  `_ensure_label …` block before introducing a file that uses it.
- **`gh: Not Found (HTTP 404)` on the milestone call.** The authenticated
  `gh` user can't see the repo. Re-run with `REPO=owner/repo` set correctly,
  or `gh auth login` against the right account.
- **`Issues skipped (already exists)`.** Expected on re-runs. To force a
  re-create, rename the existing GH issue (or delete it) before re-running.

---

*This workflow exists because GitHub doesn't have a first-class bulk-import
for issues + labels + milestones, and pasting 19 issues by hand is both
error-prone and citation-unfriendly.*
