# Prompt: Audit and rewrite API-driven category labels for voice consistency

## Role

You are a senior UX copywriter specializing in accessible language, paired
with engineer-level fluency in TypeScript and Python. You audit the strings
that flow through `ApiCategory.label` and `ApiCategory.description` (and any
sibling user-facing fields), and rewrite each one to conform to Scout's
voice and copy style guide.

This is a focused follow-up to the main voice-cleanup pass (PR titled
`chore(voice): align M1 surfaces with DEC-021`). That PR explicitly left
API-driven category strings out of scope because their source lives
outside `apps/web/`. Your job is to close that gap.

## Inputs (read these before writing)

1. **`docs/contributor/voice-and-copy.md`** — the binding voice and copy
   style guide. Especially §3 (plain-language standards), §4 (talking
   about disability), §6 (Scout's house words), §7.3 (field labels and
   help text), §10 (punctuation, numbers, names), and §12 (the
   never-write list).
2. **`docs/03-decisions.md` DEC-021** — establishes the guide as binding.
3. **`docs/02-prd.md` §6.1 M1-F06** — lists the M1 category set, the
   button label, and the persistence behavior.
4. **`docs/02-prd.md` §6.1 M1-F07** and **`docs/appendix-data-schema.md`** —
   the Feature schema and how categories relate to the data.
5. **`AGENTS.md`** and **`apps/backend/AGENTS.md`** — conventions for
   commits, tests, mocks, and per-stack rules.
6. **`apps/web/components/ProfileCategoryFields.tsx`** — the consumer.
7. **`apps/web/lib/api.ts`** — the `ApiCategory` type and the typed fetch
   wrapper that gets the categories.
8. **`apps/web/components/OnboardingModal.tsx`** — also consumes
   `category.label` / `category.description` via the same fields.
9. **The voice-cleanup PR** (`chore(voice): align M1 surfaces with
   DEC-021`). Read its final state in the merge commit so you don't
   re-rewrite the surrounding components.

## Sequencing

Run this work **after** the main voice-cleanup PR merges. The two pieces
of work touch different files (the cleanup PR touches `apps/web/`; you
will touch the backend or fixtures), but executing serially eliminates
any risk of double-edits on shared consumer components.

## What to find first

The strings you care about — `category.label`, `category.description`,
and any sibling user-facing fields on `ApiCategory` — originate from one
of these places, in order of likelihood:

1. A static Python constant or fixture in `apps/backend/scout/` (look
   for a `categories.py`, `seed.py`, or similar).
2. A backend-served database row populated by a migration or ingestion
   script (`scripts/ingest_dc.py` or a sibling).
3. A frontend fixtures file in `apps/web/lib/fixtures/` used by tests
   and demo modes.
4. The `appendix-data-schema.md` document (if it normatively names
   categories).

**You must locate every source and audit every one.** A category whose
`label` is rewritten in one source but stays jargony in another
(e.g., frontend test fixtures vs. backend response) defeats the
purpose.

## What to produce

A single PR — titled
`chore(voice): rewrite category labels for voice consistency (DEC-021 follow-up)` —
that:

1. **Locates** every source of `category.label` /
   `category.description` / sibling user-facing strings, and lists
   them in the PR description.
2. **Rewrites** each string against the voice guide. For every change,
   cite the guide section in the PR description (e.g., "§6 house
   words: 'aid' → 'support'"; "§4.3: 'audible pedestrian signal' →
   'audible signal (APS on first mention)'").
3. **Updates** any tests (backend or frontend) that assert verbatim
   strings on these fields.
4. **Updates** `docs/02-prd.md` §6.1 M1-F06's category list if the
   category names change in the rewrite. Same-PR per the
   `AGENTS.md` doc-hygiene rule.
5. **Does not** change `category.id` values. IDs are stable
   identifiers consumed by `localStorage` (`scout.profile.v1`,
   per PRD M1-F06) and possibly by URL parameters in M2 — renaming
   them silently breaks persisted user preferences.

## Specific watch-out items

These are the violations most likely to surface in the current category
strings. Inspect each:

- **"aid" / "obstacle" surfaced to users.** The PRD spec calls
  features `aid` or `obstacle` as their `kind` enum value. Those are
  fine in code and data. They are **not** fine in `label` /
  `description`. User-facing copy uses **"support"** for things-you-
  want-to-find (§6 house words) and **"obstacle"** is allowed but
  shouldn't be a label prefix.
- **"Barriers"** is reserved for the DC `BARRIERS_PUB_ROW` term of
  art (§6 house words). If the category labels say "Sidewalk
  barriers," verify that's literally the DC dataset's term; if it's
  generic, rewrite to "Sidewalk obstacles."
- **"Audible pedestrian signals"** — guide §4.3 says **"audible
  signal"** in body, expand to **"accessible pedestrian signal
  (APS)"** on first mention. If the label is "Audible pedestrian
  signals" and shown alone in a list, that's effectively the first
  (and only) mention — keep the full term.
- **"Curb ramps"** — matches guide §4.3 and DC OpenData; keep as is.
- **"Water/cooling"** — slash compounds read awkwardly to screen
  readers. Consider rewording to "Water and cooling" or splitting
  into two categories.
- **"Rest/seating spots"** — same slash problem. Consider "Places
  to rest."
- **Descriptions** that read like spec language ("obstacle if
  non-compliant/missing") must be rewritten to plain user-facing
  phrasing.
- **Reading level.** Microcopy target is FK ≤ 6 (§3). Many spec-
  derived labels will be at grade 9+ until rewritten.

## Style

- Every changed string is testable against the guide section you
  cite in the PR description.
- Avoid jargon ("ingestion source," "normalized," "row," "datum") in
  user-facing strings — these are code words, not user words.
- Descriptions are 1–2 short sentences. No semicolons. No nested
  clauses.
- Sentence case for labels. No trailing colons.

## Don't

- Don't change `category.id` values.
- Don't rewrite copy outside the category fields. The main voice-
  cleanup PR owns the surrounding components. If you find drift in
  the consumer (e.g., a label that's hard-coded in
  `ProfileCategoryFields.tsx` rather than coming from the API),
  flag it in the PR description but don't fix it here.
- Don't reverse DEC-021 or any other `DEC-NNN`. Per `AGENTS.md`
  rule #4, open a proposal at `docs/proposals/DEC-NNN-followup.md`
  if you disagree.
- Don't add new dependencies (per `AGENTS.md` policy).

## Deliverable

A single PR with:

- The category-string rewrites in their canonical source files.
- Updated tests for backend and/or frontend.
- Updated `docs/02-prd.md` §6.1 M1-F06 if any category names change.
- A PR description with a row per changed string: old string, new
  string, guide section cited.

Commit message convention: `chore(voice): rewrite category labels for
voice consistency (DEC-021 follow-up)`. If the work spans backend
and frontend in the same PR, that's fine — these strings are one
logical change.
