# Scout — voice and copy style guide

**Status:** Draft (sections 1–10 of a 13-section guide) ·
**Owner:** [project lead] ·
**Last updated:** 2026-05-21

This guide is **binding per `AGENTS.md` and `DEC-021`.** All user-facing copy
in the Scout repo — buttons, errors, disclaimers, alt text, aria-labels,
live-region announcements, About prose, freshness chips — must follow it.
When the guide and a `DEC-NNN` decision conflict, the decision wins per the
decisions-log convention.

This is the first draft (Rounds 1–2 of a planned three-round collaboration).
Future updates will add: tone modulation by surface, a complete never-write
list, and tooling for testing copy before merging.

---

## Why this guide exists

Scout is a civic-good app for people whose mobility limits how they get
around DC. The words we put in front of them carry weight that pretty
animations don't fix. A confidently-written sentence in the wrong tone —
sales-y, jokey, condescending, hedging, alarmist — can quietly make Scout
feel "not for me," or worse, "for me but I can't trust it."

This guide is the rule set that keeps every surface sounding like the same
product, written by people who respect the reader.

---

## 1. Audience

We write for, in priority order:

1. **The partially-mobile DC resident** planning a real trip. May use a
   cane, brace, or occasional wheelchair. May be in pain. May be in a
   hurry. Reads on a phone, often outside, often one-handed.
2. **The full-time wheelchair user, blind/low-vision DC resident, or
   caregiver** routing for themselves or someone else.
3. **A contributor or maintainer** reading the same surfaces while they
   work.
4. **Visitors to DC** using Scout for the first time.

We **do not** write for: investors, journalists who like origin stories,
search-engine crawlers, or imagined "general users." Decisions are made
for #1 first.

---

## 2. Voice — five attributes

Scout's voice is **clear, friendly, civic, community-minded,** and
**honest about limits.** Each attribute has a definition and a do/don't
pair. If you can't write the line so it satisfies all five, rewrite the
line.

### 2.1 Clear

One idea per sentence. Plain words. No jargon. No throat-clearing.

- Do: _"Pick which features matter to you before you search."_
- Don't: _"In order to surface the most relevant features for your
  journey, please first configure your preferences."_

### 2.2 Friendly

Warm second-person for instructions and CTAs. No condescension. No pet
names. No exclamation marks except in genuine celebration (which is
almost never).

- Do: _"You can change this any time on the About page."_
- Don't: _"Don't worry — you can always change this later!"_

### 2.3 Civic

Scout is part of public infrastructure. The voice sits in that
tradition — like a well-written transit sign or a parks pamphlet.
Never sales-y, never "delight"-y.

- Do: _"Scout uses DC's public ADA-compliance data and OpenStreetMap."_
- Don't: _"Powered by best-in-class open data!"_

### 2.4 Community-minded

We're with the reader, not selling to them, and not above them. The
reader knows their own body and their own neighborhood better than we
do. Our job is to give them what they need to make their own call.

- Do: _"We don't have inspection data for this block. You may want to
  scout it on foot first."_
- Don't: _"We've determined this route is suitable for your needs."_

### 2.5 Honest about limits

The data is stale, partial, and from many sources. Pretending otherwise
is the failure mode that hurts users. Every claim has a known boundary,
and we show it.

- Do: _"Last inspected: 2016. The street may have changed since."_
- Don't: _"Verified accessible."_ (We can't verify anything.)

**Honest-about-limits applies to us first.** Never make commitments on
Scout's behalf in copy that the maintainers haven't actually committed
to. If we say _"we're tracking this,"_ there had better be a tracked
issue. If we say _"we'll add this in a future release,"_ there had
better be a milestone for it. If we don't know whether the thing is
tracked, the safer copy reports the gap and stops there.

---

## 3. Plain-language standards

Scout targets **WCAG 2.2 AAA 3.1.5** (reading level) per `DEC-009`. In
practice:

- **Reading level**: target **Flesch–Kincaid grade ≤ 8 for body copy**,
  **≤ 6 for microcopy** (buttons, labels, errors, tooltips, freshness
  chips). Headings are exempt. The lower number for microcopy matches
  DEC-009's lower-secondary floor for the text users read most often.
- **Sentence length**: aim for ≤ 20 words. Hard cap at 25 in body, 12
  in microcopy.
- **One idea per sentence.** If you find an "and" or a comma joining
  two thoughts, split the sentence.
- **No nested clauses** in microcopy. Body can use them but be sparing.
- **Active voice by default.** Passive only when the actor is genuinely
  unknown or irrelevant (_"Inspections were last performed in 2016"_ is
  fine; _"Your route was generated for you"_ is not).
- **Concrete over abstract.** _"Last inspected: 2016"_ not _"Data
  freshness indicator."_
- **Numbers as digits** (1, 2, 30 m, 2016) — never spelled out — except
  at the start of a sentence.
- **No throat-clearing.** Cut _"in order to," "please note that," "as
  you may know," "simply," "just," "easy."_
- **No hedging language.** Cut _"might possibly," "may potentially," "in
  some cases may."_

Tooling for measuring reading level lands in a future section of this
guide.

---

## 4. Talking about disability

This is where careless copy does the most damage, so the rules are
explicit.

### 4.1 Default to task-descriptive language

The phrasings we reach for first describe what the person is doing or
needs, not what they "are."

| Reach for                              | Instead of                          |
| -------------------------------------- | ----------------------------------- |
| "people who use a cane"                | "the cane-bound"                    |
| "wheelchair users"                     | "wheelchair-bound," "confined to a wheelchair" |
| "people who need step-free routes"     | "the disabled"                      |
| "people with low vision"               | "the visually impaired" / "the blind" |
| "blind and low-vision readers"         | "the sight-impaired"                |

### 4.2 When task-descriptive doesn't fit

Some sentences genuinely need a noun form. Both **person-first**
("a person with a disability") and **identity-first** ("a disabled
person") are acceptable. Pick whichever reads more naturally in
context. Never use:

- "differently-abled," "special needs," "handicapped," "handi-capable"
- "wheelchair-bound," "confined to," "suffers from," "afflicted with"
- "the disabled" as a noun
- "normal" / "able-bodied" as antonyms (use "non-disabled" only if you
  must contrast)
- "brave," "inspiring," "hero," "warrior" applied to the reader

### 4.3 "Accessible" as a modifier — what it actually means

Scout's domain involves a lot of "accessible X." Be precise.

| Phrase                  | Means                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| "wheelchair-accessible" | passable by a standard manual or power wheelchair                                      |
| "step-free"             | **zero steps** in the path (more inclusive than "wheelchair-accessible")               |
| "step-aware"            | **a small number of steps that are explicitly communicated** to the user up front      |
| "accessible restroom"   | meets ADA Title III restroom standards — wide door, transfer space, grab bars          |
| "accessible bus stop"   | level boarding area, audible announcements, room for a mobility device                 |
| "ADA-compliant"         | meets the federal standard. **Do not use as a synonym for "good." A compliant feature can still be in poor condition.** |
| "audible signal" (APS)  | accessible pedestrian signal — auditory crosswalk indicator                            |
| "curb ramp"             | the sloped path at a corner. Not "curb cut" (a colloquial regional variant).           |

### 4.4 Replace "wheelchair-informed routes"

The phrase _"wheelchair-informed walking routes"_ describes the routing
engine, not the user. It's banned in product copy.

- **Long form** (About, social cards): _"walking routes that avoid
  common mobility obstacles."_
- **Short form** (homepage hero, route view header): _"walking routes
  with accessibility cues"_ or _"step-aware walking routes."_
- **Shortest form** (buttons, share titles): _"Plan a route"_ — the
  qualifier lives in the surrounding context.

Concision is a real concern, so the short forms exist for tight
surfaces. The long form is the canonical statement.

---

## 5. Pronouns and inclusive references

When you write about a hypothetical person, use **singular "they."**
Not _"he or she,"_ not _"he/she,"_ not the generic _"he."_ When you
write about a specific known person, follow their stated pronouns.

| Do                                                                          | Don't                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| _"People can use Scout to get around the city with their friends."_         | _"A user can use Scout to plan his or her route."_                          |
| _"If a reader uses a cane, they can choose the step-aware option."_         | _"If a user uses a cane, he or she can choose the step-aware option."_      |

Singular "they" is grammatically standard in modern English
(Merriam-Webster, AP, Chicago, APA), and lands cleanly for
non-binary, gender-unknown, and screen-reading audiences.

---

## 6. Scout's house words

These decisions are binding. When you write copy, use the **Use**
column.

| Concept | Use | Don't use | Notes |
| --- | --- | --- | --- |
| The trip the user is planning | **route** | trip, walk, journey, path | Matches DC data and routing engine terminology. "Trip" is okay in About prose where "route" would repeat. |
| Things along a route the user wants to avoid | **obstacle** | barrier, hazard, problem | "Barrier" is reserved for the DC `BARRIERS_PUB_ROW` dataset where it's a term of art. |
| Things along a route the user wants to find | **support** | aid, amenity, perk | "Support" reads more naturally than "aid." Code paths can stay `aid/` until refactored separately — this is a copy rule, not a code rule. |
| A row of data on the map | _(don't surface)_ | feature, point, marker, datum | Use the concrete category: "restrooms," "curb ramps," "audible signals." "Feature" is internal/dev jargon. |
| How old the data is | **last inspected** in user copy; **freshness** only in maintainer copy | "vintage," "as of" | The chip's exact text: _"Data may be outdated (last inspected YYYY)"_ |
| The crosswalk audio indicator | **audible signal** in body; expand to **accessible pedestrian signal (APS)** on first mention in long-form prose | "talking crosswalk," "chirper" | Matches DC OpenData. |
| Path drop at a corner | **curb ramp** | curb cut | Matches DC OpenData and the federal ADA term. |
| The city | **Washington, DC** on first mention; **DC** thereafter; **the District** as a warm alternative after first mention | "D.C.," "DC area," "the DMV" | Pick one short form and stay consistent within a single surface. |
| The product | **Scout** | "the app," "the platform," "the tool" | Always the proper noun, never lowercased. |
| The team / maintainers | **Scout's maintainers** in legal/trust copy; **we** (sparingly) on About | "the developers," "the Scout team," "us" | "We" is reserved for moments where the maintainers genuinely take responsibility (About contact section, contribution guides). |
| The reader | **you** in instructions and CTAs; **people who [task]** in descriptive prose | "users," "the user," "folks" | Avoid "users" except in maintainer-facing docs. |
| The accessibility preferences flow | **categories** (the things you toggle on/off); **preferences** (the saved set) | "filters," "profile" in user-facing copy | "Profile" stays in code (`useProfile`); user-facing copy says "preferences." |
| Buffer around route | **how close to your route** features must be | "buffer," "tolerance," "radius" | Buffer is dev jargon. |

---

## 7. Microcopy patterns

This is the section agents will reach for most. Each pattern has a
principle and a do/don't, with examples grounded in Scout's surfaces.

### 7.1 Buttons and primary actions

- **Verb-first.** Start with the action: _"Open planner," "Save
  preferences," "Show details."_
- **Sentence case**, never title case. _"Open planner"_ not _"Open
  Planner."_
- **Concrete object.** _"Save preferences"_ not _"Save"_ alone, and not
  _"Save preference set"_ (users don't think of it as a "preference
  set").
- **One to three words.** Four max. If you need more, the button is
  doing too much.
- **No promises.** _"Find route"_ not _"Get the best route."_
- **No "Submit," "OK," "Done"** unless the context is genuinely generic.
  Buttons name what happens.

| Do                  | Don't                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| Open planner        | Get Started!                                                                           |
| Save preferences    | Save preference set                                                                    |
| Reset to defaults   | Snap back to defaults                                                                  |
| Plan a route        | Submit                                                                                 |
| Not now             | Cancel _(when the action is "dismiss," "Not now" is friendlier; "Cancel" is fine when it actually cancels an in-progress action)_ |

### 7.2 Links

- **Self-describing**: the link text alone (no surrounding sentence)
  tells the reader where the link goes. (WCAG 2.4.4 / 2.4.9.)
- **Banned link text**: _"click here," "here," "read more," "learn
  more," "this," "this link," "more info."_
- **No "click."** Touch and keyboard users don't click. Use the verb
  that names the destination's content: _"Read…," "Browse…," "See…,"
  "Open…."_
- **One link per idea.** Two links in one sentence to the same
  destination is confusing for screen-reader users navigating by links.
- **Parenthetical clarifiers belong inside the link** if they help
  out-of-context understanding.

| Do                                                          | Don't                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| Read the AGPL-3.0 license                                   | Click here for the license                             |
| Browse Scout on GitHub                                      | Learn more                                             |
| About data sources and the disclaimer                       | Learn more (data sources & disclaimer)                 |
| Read the crowdsourcing disclaimer before planning a trip    | Read more about our disclaimer                         |

### 7.3 Field labels and help text

- **Labels are nouns or noun phrases.** _"Starting address," "Buffer
  distance."_
- **Labels never end in a colon** in this design system.
- **Help text describes what to enter, not why we're asking.** Two
  sentences max. Plain words.
- **Placeholders are not labels.** A placeholder may show format
  (_"e.g. 14th & U NW"_) but the label is always present and visible.
- **Required fields**: marked with text _"(required)"_ — never with an
  asterisk alone, never with color alone.

### 7.4 Errors

The rule: **say what happened, then say what the reader can do.** No
blame, no exclamation, no anthropomorphism.

- **No "Oops," "Whoops," "Sorry."** They're either insincere or
  insufficient.
- **No exclamation marks** in error copy. Ever.
- **Name the problem in plain words.** _"We couldn't find that
  address"_ not _"Geocoding failed (ERR_404)."_
- **Give the next step.** Either a fix the user can do, or an
  alternative they can try.
- **Never blame the user.** _"We couldn't find that address"_ not
  _"You entered an invalid address."_
- **Never anthropomorphize Scout.** Not _"Scout got confused";_ not
  _"Scout couldn't…."_ If Scout failed, say what failed and what they
  can do.

| Do                                                                                                              | Don't                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| _"We couldn't find that address. Try a nearby intersection or a landmark."_                                      | _"Oops! Scout couldn't find that address — please try again."_                |
| _"This route crosses a stretch with no mapped curb ramps. You may want to scout it on foot first."_              | _"Warning: route accessibility cannot be guaranteed."_                         |
| _"Routing is taking longer than usual. You can wait, or pick a closer destination."_                             | _"Something went wrong. Please try again later!"_                              |

### 7.5 Empty states

When a category, a neighborhood, or a route has no data — the most
common case in DC for many categories — voice **acknowledges the gap
without apologizing for it** and offers what's possible.

| Do                                                                                                                              | Don't                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| _"No restrooms are mapped along this route. The closest mapped restroom is at Dupont Circle, about 4 blocks off-route."_         | _"Sorry, we don't have any data for that!"_         |
| _"DC's open data doesn't include water fountains east of the Anacostia. The closest mapped fountain is at Lincoln Park."_        | _"No results found."_                                |
| _"This category has no features in your buffer. Widening the buffer to 60 m may surface nearby options."_                        | _"Empty."_                                           |

Underline: the empty state is an honest moment, not a failure. Treat it
that way. Per §2.5, don't write _"we're tracking this gap"_ unless
there is, in fact, a tracked issue.

### 7.6 Loading and progress

- **Verb-ing the action.** _"Finding route…"_ not _"Loading…"_ when
  something specific is happening.
- **No spinner-only states for waits over 2 seconds.** Pair the
  spinner with words.
- **No fake progress.** If you don't know the percent, don't fake a
  percent.
- **Quiet by default.** A wait under 1 second probably doesn't need
  copy at all.

### 7.7 Success and confirmation

- **Past tense, factual.** _"Preferences saved."_ Not _"Hooray —
  preferences saved!"_
- **No exclamation marks.** Saving a setting is not an event that
  warrants celebration.
- **No "welcome aboard," "you're in," "let's go."**
- **Prefer inline confirmations over toasts, and toasts over modals —
  this is an accessibility call, not just a UX one.** Modals interrupt
  and trap focus; timed toasts can be missed by screen-reader users
  (WCAG 2.2.1, Timing Adjustable). When Scout has a choice, it picks
  the form that's least intrusive to a keyboard or screen-reader user.

Before / after illustrations of the rule:

- _"Category toggles snapped back to Scout defaults."_ →
  _"Categories reset to defaults."_
- _"Saved preferences — welcome aboard."_ →
  _"Preferences saved."_

### 7.8 Freshness chips and inspection notes

These are Scout's most distinctive microcopy. The chip and the
surrounding sentence carry the trust posture.

- **Always include the year**, never just _"outdated"_ or _"stale."_
- **Use "last inspected"** (user-facing) — not _"vintage," "freshness,"_
  or _"as of."_
- **Never imply the user is wrong to trust it** — they're allowed to use
  stale data with eyes open.

Canonical copy:

- Chip: _"Data may be outdated (last inspected 2016)"_
- Inline: _"Last inspected: 2016"_
- Unknown date: _"Inspection date unknown"_ (better than _"N/A"_ or
  _"Unknown date"_).

Edge cases to handle in future copy:

- Multiple inspection years on one feature: _"Last inspected: 2016
  (curb ramp); 2019 (audible signal)."_
- A range across a dataset: _"Inspections span 2015–2019; most are
  2016."_
- A specifically-recent inspection: just show the year — no _"Verified
  recently"_ or _"Up-to-date"_ chip. We don't make freshness claims,
  we report facts.

### 7.9 Tooltips and on-hover help

- **Short.** One sentence, ≤ 12 words.
- **Defines or expands; never required reading.** A tooltip can't be
  the only place a fact lives.
- **Available to keyboard and screen reader,** which means
  `aria-describedby`, not the `title` attribute. (Implementation
  detail, but the copy implication is: tooltips can't say what the
  visible UI doesn't.)

---

## 8. Trust and disclaimer copy

Trust copy is what tells the reader what Scout knows, what it doesn't,
and where the boundaries are. It's the most consequential prose in the
product. The rules below keep it honest without sounding legalistic or
alarmist.

### 8.1 The trust ladder

Scout has four distinct trust-copy intensities, used at four different
surfaces. They are not interchangeable.

| Intensity              | Where it lives                                  | What it does                                                                                                       | Length             |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| **L1 — Full disclosure** | `/about#disclaimer` only                        | The complete statement of what Scout is, what its data is, and what its limits are. Read once.                     | 2–5 sentences      |
| **L2 — Standing reminder** | Top of route/plan views (the banner)            | A short, factual reminder that this is planning data, with a link to L1. **Dismissible per session** (DEC-010).    | 1 sentence         |
| **L3 — In-context note**   | Next to a route, a category, or a feature group | A specific note about this thing — its freshness, its source, its known gap.                                       | 1 short sentence or chip |
| **L4 — Feature-level chip**| Per feature on the map and in the parallel list | Inspection year. That's it.                                                                                        | 3–5 words          |

### 8.2 Tone rules (apply at every level)

- **State facts; don't disclaim outcomes.** _"This data is from 2016"_
  is honest. _"Scout's maintainers are not responsible for trip
  outcomes"_ is a release form.
- **Present tense.** _"Scout shows public data,"_ not _"Scout has
  shown."_
- **Plain words, no legalese.** No _"warrant," "guarantee," "liable,"
  "responsible," "without limitation," "as-is," "to the fullest extent
  permitted."_ A reader at a 6th-grade level should understand every
  disclaimer.
- **No alarm language.** No _"Warning:"_ prefixes, no caution-tape
  colors carrying the message alone, no all-caps. The visual warning
  surface in the design system already carries the signal; the words
  don't need to shout.
- **Acknowledge the user's agency.** They are deciding whether to use
  this data, with full knowledge of its limits. We are not _giving
  them permission_ — we are _giving them facts._

---

## 9. Writing for screen readers

Scout already tests with VoiceOver, NVDA, and TalkBack (`NF-A11Y-03`).
The rules below make the copy do its share of the work.

### 9.1 The accessible name is the visible text — whenever possible

When a control has visible text, the screen reader reads that text.
Don't write a different `aria-label` "for screen readers." Two
different texts confuse users who use both eyes and ears.

| Situation                       | Rule                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Button with visible text        | Visible text is the accessible name. No `aria-label`.                                                         |
| Icon-only button                | `aria-label` matches the action: `aria-label="Close dialog"` (not "Close the modal" — "modal" is dev jargon). |
| Icon + visible text             | Visible text is the name. Icon is decorative (`aria-hidden="true"`).                                          |
| Decorative image / SVG          | `alt=""` or `aria-hidden="true"`. Empty alt is correct, not lazy.                                             |
| Informative image / map marker  | Alt or `aria-label` describes the **information**, not the picture. _"Curb ramp, non-compliant, inspected 2016"_ — not _"Red triangle icon."_ |

### 9.2 Aria-label length

- **≤ 10 words.** Anything longer is punishment for the user.
- **No periods.** Aria-labels are fragments, not sentences.
- **No "button," "link," "icon."** The screen reader already announces
  the role.

### 9.3 Headings

- **One `h1` per route.** It's the page title.
- **Headings describe the section, not the product.** _"Data sources"_
  not _"Scout's data sources"_ (you're already in Scout).
- **Sentence case.** _"Data sources"_ not _"Data Sources."_
- **Heading text is part of the page-skim experience for screen-reader
  users.** Make it count.

### 9.4 Link text (formalizing §7.2 for screen readers specifically)

Screen-reader users navigate by pulling up a list of every link. In
that list, link text is read with no surrounding sentence. Every link
must make sense alone. (See §7.2 for the do/don't.)

### 9.5 Live-region announcements (the `useAnnounce` system)

These are heard, not read. Different rules apply.

- **One sentence, past tense, ≤ 12 words.**
- **Factual, not celebratory.** _"Preferences saved."_ not _"Saved
  preferences — welcome aboard."_
- **No exclamation marks** (a screen reader doesn't audibly distinguish
  them, but the rule is for consistency with written copy).
- **Polite by default.** Only escalate to `assertive` for things the
  user truly needs to know now (a route failed, a destination is
  unreachable).
- **Avoid back-to-back announcements.** Group related state changes
  into one sentence.

Before / after illustrations of the rule:

- _"Category toggles snapped back to Scout defaults."_ →
  _"Categories reset to defaults."_
- _"Saved preferences — welcome aboard."_ →
  _"Preferences saved."_

### 9.6 Abbreviations

- **Expand on first mention per surface** in prose: _"the Americans
  with Disabilities Act (ADA),"_ thereafter _"ADA."_
- **In microcopy**, just use the abbreviation. The screen reader
  generally reads the letters individually, which is fine for ADA, DC,
  WCAG, AGPL.
- **Some abbreviations read poorly.** _"ORS"_ gets read as a word
  ("orz") by some screen readers; expand to _"OpenRouteService"_
  everywhere it appears in user-facing copy.
- **`<abbr title="">`** is used only when expansion-on-first-mention
  isn't possible (extremely tight microcopy). Reserve it.

### 9.7 The map is not screen-reader content

Map markers, layers, and visual buffer indicators are **not** the
accessible content. The parallel `<FeatureListView />` (PRD §6.1) is.
That means:

- Every datum that appears on the map must appear in the list, with
  text.
- The list's copy is held to the same voice rules as everything else.
- Map alt text is **not** a substitute for the list. (You can't
  describe a map of 200 features in an `aria-label`.)

---

## 10. Punctuation, numbers, names, abbreviations

Reference material. Skim and revisit when needed.

### 10.1 Punctuation

- **Sentence case** for headings, buttons, and labels. Title Case
  Looks Like A Magazine Cover.
- **Serial comma** ("Oxford comma") — yes. _"obstacles, supports, and
  freshness chips."_
- **Em-dash (—)** with no surrounding spaces, used sparingly. ≤ 1 per
  sentence; avoid in microcopy.
- **En-dash (–)** for ranges: _"2015–2019."_ Not a hyphen.
- **Ellipses** for genuine truncation only ("…"), not for trailing-off
  prose voice.
- **No exclamation marks** anywhere in user-facing copy. Limit: zero.
- **Quotation marks**: typographic ("smart" quotes) preferred for
  prose; straight quotes in code blocks.
- **Parentheses** allowed but lean toward commas or sentence splits.
- **Apostrophes** always typographic in user copy (Scout's, don't,
  can't).

### 10.2 Numbers

- **Digits, not words.** 1, 2, 30, 2016. Exception: at the start of a
  sentence (_"Sixteen percent of mapped curb ramps…"_), or for the
  numbers zero and one in body prose when they read better (_"one
  block away"_).
- **Units with non-breaking space.** _30 m, 60 m, 5 min._ (Use
  `&nbsp;` so they don't break across lines.)
- **Ranges with en-dash.** _2015–2019_, _30–60 m_.
- **Percentages**: digit + percent sign, no space. _60%._
- **Currency**: not applicable in M1.
- **Counts shown to the user**: spell out the unit. _"3 restrooms"_
  not _"3."_

### 10.3 Dates

- **Year alone** when that's all we know: _2016._
- **Month + year** when month matters: _March 2016._
- **Never numeric formats** in user copy: not _3/16,_ not _16-03,_ not
  _2016-03-15._
- **Relative dates** are okay in low-stakes ephemeral copy (_"updated
  yesterday"_); never for inspection years (which are facts that
  don't change relative to "now").

### 10.4 Place names

- **Washington, DC** on first mention per surface.
- **DC** thereafter (default short form).
- **The District** is allowed as a warm alternative after first
  mention. Pick one and stay consistent within a surface.
- **Neighborhoods** spelled as DC residents spell them: _Dupont
  Circle, Anacostia, Capitol Hill, Adams Morgan, Mount Pleasant._
- **Quadrants** abbreviated with no periods: _NW, NE, SE, SW._ _"14th
  & U NW"_ is the canonical address style.
- **Avoid**: _"the DMV"_ (region, not the city), _"DC area"_ (vague),
  _"D.C."_ (with periods).

### 10.5 Product and project names

| Name              | Casing                                                 | Notes                                                                              |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Scout**         | Capitalized noun                                       | Never lowercased, never italicized, never in quotes.                               |
| **OpenStreetMap** | One word, two capitals                                 | OSM acceptable after first mention.                                                |
| **OpenRouteService** | One word, three capitals                            | Expand on first mention. **"ORS" is not used in user copy** — reads poorly aloud.  |
| **MapLibre GL JS** | One word "MapLibre"; "GL JS" only in technical copy   | "MapLibre" alone in user copy.                                                     |
| **Project Sidewalk** | Two words                                            | UW research project; capitalize both.                                              |
| **Protomaps**     | One word, capitalized                                  |                                                                                    |
| **OpenData** (DC's portal) | One word, two capitals                        | DC's branding.                                                                     |
| **AGPL-3.0**      | All caps with hyphen-version                           | Expand to "GNU Affero General Public License, version 3.0" only in long-form license discussion. |
| **WCAG 2.2 AA / AAA** | All caps, period in version                        | Always "WCAG 2.2 AA" — never "WCAG AA 2.2" or "WCAG2.2."                           |
| **ADA**           | All caps                                               | Expand on first mention in long-form prose.                                        |

---

*Sections 11–13 (tone modulation by surface, never-write list, how to
test copy before merging) are drafted in the next round and will be
appended in a follow-up commit.*
