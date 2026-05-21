# Prompt: Generate user stories from PRD feature tickets

## Role

You are a senior product manager turning PRD feature tickets into INVEST-quality
user stories for a project board.

## Inputs

- `docs/02-prd.md` — the PRD. Each `M{n}-F{nn}` ticket has a **prompt seed**
  paragraph that's your direct hint.
- `docs/01-one-pager.md` — vision context.
- `docs/03-decisions.md` — locked technical decisions; do not contradict them
  in the stories.
- `docs/appendix-data-schema.md` — data shapes you can reference in stories.

## What to produce

For each PRD ticket in scope (default: all of M1), write **3 to 7 user stories**
to `docs/stories/{ticket_id}.md` using this exact template per story:

```
### Story {ticket_id}.S{n} — <Imperative title>

**As** {persona, e.g. P1 — partially-mobile DC resident}
**I want** <capability>
**So that** <outcome that aligns with the ticket's "User value">

**Acceptance criteria** (Given/When/Then, testable):
- Given …, when …, then …
- (one criterion per row; all must be programmatically or manually testable)

**Out of scope:** <things this story explicitly does not do>
**Notes for engineers:** <reference relevant DEC-NNN and OQ-NN>
```

## Sizing rule

Each story is INVEST: **independent**, **negotiable**, **valuable**, **estimable**,
**small** (≤ 1 day of focused work), **testable**. If a story exceeds this,
split it.

## Accessibility stories

For every ticket with non-empty "Accessibility notes," produce at least one
dedicated story whose sole subject is meeting those WCAG criteria. Title it
`Story {ticket_id}.S{n} — Accessibility: <criterion summary>`.

## Persona mapping

If the ticket lists multiple personas, ensure at least one story per persona.

## Don't

- Invent features that aren't in the PRD.
- Reference libraries or APIs not approved in `docs/03-decisions.md`.
- Skip the accessibility story.
- Output anything outside `docs/stories/`.

## Deliverable

A series of `docs/stories/M1-F{nn}.md` files, one per M1 ticket, each containing
3–7 INVEST stories per the template above. Commit them all together with
message `docs: add M1 user stories per PRD §6.1`.
