# Prompt: Produce the M1 WCAG 2.2 AA audit checklist

## Role

You are a senior accessibility specialist with 10+ years of WCAG audit experience.
You produce a concrete, testable checklist used to gate M1 launch.

## Inputs (read these before writing)

- `docs/02-prd.md` §6.1 ticket M1-F10 and §7.1.
- `docs/03-decisions.md` DEC-009 (WCAG 2.2 AA + selected AAA).
- All M1 frontend tickets (F01, F02, F03, F05, F06, F08, F09, F14) so the
  checklist matches the actual UI surface.

## What to produce

A single file `docs/a11y-checklist.md` structured as:

1. **Scope.** Which pages, components, and flows are covered. Out-of-scope is
   listed explicitly.
2. **Methodology.** Combination of automated (`@axe-core/playwright`),
   semi-automated (Lighthouse, Wave), and manual (keyboard, screen reader on
   each major OS). State exactly which version of each tool, and how a
   reviewer reproduces every check.
3. **Per-criterion checklist.** For every WCAG 2.2 AA success criterion (plus
   the targeted AAA criteria from DEC-009), list:
    - SC number and title (e.g. "1.4.3 Contrast (Minimum)").
    - Which Scout pages/components are subject to it.
    - The specific check ("Open the Profile modal, focus the first checkbox,
      verify the visible focus indicator has ≥ 3:1 contrast against the
      surrounding background").
    - Pass/Fail/N-A box.
    - Notes column.
4. **Screen-reader test scripts.** Two short scripts (VoiceOver-Safari + NVDA-Firefox)
   that a tester can read aloud:
    - "Open the app. Tab through to the route planner. Enter '14th & U' as
      start and 'US Capitol' as destination. Submit. Confirm the route summary
      is announced. Confirm the parallel list view is announced. Confirm at
      least one feature popup is announced. Confirm Escape closes the popup
      and focus returns sensibly."
5. **Known limitations.** Be honest. Items we deliberately do not meet at
   M1 (e.g., AAA 1.4.6 on the map symbol contrast, where the data symbol
   density forces a compromise) are listed with explicit rationale and a path
   to revisit.
6. **Sign-off.** A signature line for the auditor and a date.

## Style

- Every checklist item is testable in under 5 minutes by someone who's read this
  document.
- Avoid vague language ("ensure good contrast") in favor of concrete steps
  ("open DevTools, run axe, expect 0 violations on `/plan` route").
- If a criterion isn't applicable, say "N/A — no audio/video content in M1"
  rather than skipping the row.

## Don't

- Don't list every WCAG criterion only by number — include titles and
  Scout-specific applicability.
- Don't claim AAA conformance unless DEC-009 explicitly targets it.
- Don't recommend tools that aren't already in `apps/web/package.json` without
  flagging them as additions.

## Deliverable

`docs/a11y-checklist.md`. Commit message: `docs: M1 WCAG 2.2 AA audit
checklist per ticket M1-F10`.
