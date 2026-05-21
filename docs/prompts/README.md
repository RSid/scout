# Downstream agent prompt seeds

This folder contains ready-to-paste prompts for the agents you'll spin up to do
the actual building. Each prompt is **self-contained**: the receiving agent only
needs the prompt + this repo to do its job.

## How to use

1. Open the agent in this repo's root (Cursor agent, Claude CLI, etc.).
2. Copy the contents of the relevant prompt file into the agent's first message.
3. The agent will read the referenced docs (`docs/01-one-pager.md`,
   `docs/02-prd.md`, `docs/03-decisions.md`, `docs/appendix-data-schema.md`)
   before doing anything.

## Available prompts

| # | File | Scope | Output |
|---|---|---|---|
| 01 | `01-generate-user-stories.md` | Convert PRD feature tickets into INVEST-style user stories | Stories per ticket in `docs/stories/M{n}-F{nn}.md` |
| 02 | `02-scaffold-backend-m1.md` | Scaffold the FastAPI app, endpoints, tests, data model | `apps/backend/` |
| 03 | `03-scaffold-frontend-m1.md` | Scaffold the Next.js app, map view, list view, profile panel | `apps/web/` |
| 04 | `04-data-ingestion-m1.md` | Build the `scripts/ingest_dc.py` pipeline per the data schema | `scripts/` |
| 05 | `05-wcag-audit.md` | Produce a WCAG 2.2 AA audit checklist for M1 | `docs/a11y-checklist.md` |
| 06 | `06-dockerize-and-deploy.md` | Dockerfile, docker-compose, fly.toml, CI workflow | `infra/`, `.github/workflows/` |
| 07 | `07-design-system.md` | Produce the design tokens, marker shapes, and key-screen mockups | `apps/web/design/` |

## Conventions every downstream agent must follow

1. **Read the docs first.** Do not start coding until you've read
   `docs/01-one-pager.md`, `docs/02-prd.md` (at least the sections you're scoped
   to), and `docs/03-decisions.md`.
2. **Cite feature IDs.** PRs and commits reference the relevant ticket IDs
   (e.g. `M1-F04`) so traceability holds.
3. **Don't re-litigate decisions.** If you disagree with a `DEC-NNN`, raise it as
   a separate proposal — don't quietly do it differently. Add a new
   `docs/proposals/DEC-NNN-followup.md` and stop.
4. **Update `docs/02-prd.md` §10 (Open Questions) when you close one.** Set the
   `OQ-NN` to RESOLVED with a one-line note pointing at the PR/commit.
5. **Accessibility is non-negotiable.** Every PR runs `axe-core` in CI; if you
   can't make a change pass, escalate before merging.
6. **No new dependencies without justification.** If a feature needs a new
   library, add a one-sentence justification to the PR description.

## Order of execution (suggested)

For M1, run the prompts in this order:

1. **In parallel:**
   - `04-data-ingestion-m1.md` — builds the data layer; the API depends on its
     output.
   - `07-design-system.md` — produces the tokens the frontend will consume.
     This is a *collaborative* session with the project owner; budget time for
     real back-and-forth on aesthetic input.
2. `02-scaffold-backend-m1.md` — wraps the data layer in the API.
3. `03-scaffold-frontend-m1.md` — consumes the API and the design tokens.
4. `05-wcag-audit.md` — produces the audit checklist used by the M1-F10 gate.
5. `06-dockerize-and-deploy.md` — packages and ships.
6. `01-generate-user-stories.md` — optional; useful if you want fine-grained
   stories for project management before any of the above.
