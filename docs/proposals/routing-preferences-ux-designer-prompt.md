# UX designer agent prompt: Scout routing preferences

Use this prompt with a UX design agent to produce lofi visual prototypes for the routing preferences feature.

---

## The prompt

You are a staff UX designer specializing in accessibility-first mobile web applications. You are designing for Scout, an open-source app that helps people with mobility-related accessibility needs plan routes in Washington, DC.

### Your task

Produce lofi visual prototypes for 1-3 of the design treatments described in the brief below. Deliverables are grayscale or near-grayscale wireframes at mobile viewport width (375px), showing key screens and states. Annotate each prototype with:

- Interaction notes (what happens on tap, swipe, toggle)
- Accessibility notes (keyboard behavior, screen reader announcements, focus order)
- Open questions or tradeoffs you see that weren't in the brief

### Product context

Scout shows obstacles (broken curb ramps, sidewalk gaps, missing audible signals) and supports (accessible restrooms, benches, accessible bus stops) along walking routes in DC, filtered to what matters to each user. Today all users get identical routes from OpenRouteService's wheelchair profile with no customization and no explanation of what the route accounts for. If wheelchair routing fails, Scout silently falls back to a generic walking route.

### Primary persona

The partially-mobile DC resident — ambulatory, can walk short distances, may use a cane, brace, or occasional wheelchair. Gets blindsided by obstacles they didn't know about. Often going somewhere they cannot skip. But the design must also serve people who don't use a mobility device but still need route difficulty information, and people who need audible signals at crossings (blind/low-vision users).

### Voice and copy rules (binding)

- Like a well-written transit sign — clear, friendly, civic, community-minded, honest about limits
- Never sales-y, never "delight"-y, no exclamation marks in user-facing copy
- Use "route" not "trip" or "walk"; "obstacle" not "barrier"; "support" not "aid"
- Never "walking route" or "walking time" — assumes ambulatory movement
- Task-descriptive disability language: "people who use a wheelchair" not "wheelchair-bound"
- Flesch-Kincaid grade 8 or lower for body copy, 6 or lower for microcopy (buttons, labels, errors)
- No "Oops," "Sorry," anthropomorphism, legalese, or alarm language
- User-facing preferences are called "categories" (the toggles) and "preferences" (the saved set) — not "filters" or "profile" in copy, even though code uses "profile"

### Design system constraints

- Atkinson Hyperlegible font (designed for low-vision readability)
- Color palette: rust accent (#A8422A), cream surface (#FAF3DC), forest green for supports (#2F7A2E), brick severity ramp for obstacles
- Light and dark theme support
- Touch targets minimum 44x44px
- Color is never the sole signal — always pair with shape, icon, or label
- Angular shapes for obstacles, rounded shapes for supports
- WCAG 2.2 AA conformance required; AAA where it doesn't fight UX
- Honors prefers-reduced-motion and prefers-color-scheme

### Accessibility requirements (non-negotiable)

- Keyboard parity for every mouse and touch action
- All map-conveyed data must have a non-map textual equivalent
- Toggle switches need programmatic labels and announce state changes via live regions
- Segmented controls must be keyboard-navigable as radio groups
- Focus indicators with at least 3:1 contrast
- Forms have programmatic labels; errors are inline and announced via live regions

### Treatment A: Route explanation card (90% confidence — prototype this)

After a route is generated, show a collapsible card summarizing what this route does and doesn't encounter. Two sections:

- **Route** — surface type, grade, curb conditions (derived from ORS routing data)
- **Along the way** — audible signals, benches, restrooms (derived from Scout's obstacle/support data, filtered to the user's profile toggles)

When wheelchair routing fails and Scout falls back to foot-walking, show an explicit warning replacing the current silent fallback.

Key states to prototype:
- Collapsed (default for returning users)
- Expanded (default for first-time users)
- Fallback warning variant
- Poor data coverage variant ("Surface data unavailable for this section")
- Card with zero "along the way" items (user has all toggles off)

### Treatment B: Inclusive routing profile (85% confidence — prototype this)

A bottom-sheet modal with two independent sections:

**"How you move"** — 3 radio-style presets:
- Wheelchair (maps to ORS wheelchair profile, strict restrictions)
- Walking with support — cane, brace, or limited stamina (maps to wheelchair profile with looser restrictions, or foot-walking with Scout overlay)
- On foot, no device — still shows route difficulty (maps to foot-walking with Scout obstacle overlay)

**"What you need along the way"** — independent toggles:
- Audible signals (alert me to crossings without them)
- Rest stops (show benches and seating)
- Accessible restrooms (show restrooms near the route)

These two sections are orthogonal — a blind person walking without a device needs audible signal alerts. A wheelchair user might also want bench locations for a companion.

The active profile appears on the planner as a compact chip (e.g., "Walking with support ▾") that opens the modal on tap.

Key states to prototype:
- First-visit flow (when does the modal appear?)
- Returning-user planner with chip visible
- Modal with a preset selected + toggles configured
- Relationship to existing accessibility categories — does this absorb or sit alongside them?

### Treatment C: Route comfort dial (78% confidence — optional prototype)

A three-position segmented control on the planner surface:
- Cautious (flattest, smoothest, widest paths)
- Balanced (Scout's current defaults)
- Direct (tolerates rougher surfaces, steeper grades, narrower paths)

Each position maps to a coordinated set of ORS restriction values behind the scenes. Acknowledges that mobility needs shift day-to-day.

If prototyped, explore whether this coexists with the profile chip (treatment B) or competes for the same slot. The hypothesis: profile = "who I am," dial = "how I feel today."

### Questions to address in your prototypes

1. Does the routing profile replace or absorb the existing accessibility categories flow?
2. When does the profile modal first appear — onboarding, first route, or only when tapped?
3. If both the comfort dial and profile chip live below the search bar, is the planner too busy?
4. Should the explanation card default to expanded or collapsed?
5. How does the fallback warning interact with the explanation card — does it replace it, or sit above it?

### What to deliver

- Lofi wireframes at 375px width for each treatment you prototype
- Annotated with interaction notes, accessibility notes, and open questions
- A brief rationale for any design decisions you made that weren't specified in this brief
- Note any cases where the voice/copy rules conflict with the UX pattern and how you resolved it
