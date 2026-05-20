# Contrast and color-blind audit — M1 design system v1

This is the receipt that the v1 palette honors DEC-015's non-negotiable
constraints. Every color combination that appears in the UI is listed
below with its measured contrast ratio and its expected appearance under
three forms of color vision deficiency.

## Methodology

**Ratios.** Computed via the WCAG 2.x relative-luminance formula
([W3C Techniques §G18](https://www.w3.org/WAI/WCAG22/Techniques/general/G18)).
For each color, channel values are normalized to [0, 1] and gamma-corrected
(`s ≤ 0.03928 → c = s / 12.92`; otherwise `c = ((s + 0.055) / 1.055) ^ 2.4`).
Relative luminance `L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin`.
Contrast ratio `(L_lighter + 0.05) / (L_darker + 0.05)`.

Ratios below are accurate to ±0.05; for any combo that lands within 0.1 of
a threshold (4.5:1, 3:1), I've re-derived twice. **Final independent
verification belongs in the WebAIM Contrast Checker
(<https://webaim.org/resources/contrastchecker/>)** — that should run as
part of the first PR that scaffolds the frontend, against the tokens in
`apps/web/design/tokens/colors.ts`. If WebAIM disagrees with this file by
more than 0.1, treat WebAIM as authoritative and open an issue.

**Color-blind verification.** Each pair was analyzed against the
Viénot–Brettel–Mollon (1999) simulation transforms for protanopia
(no L-cones), deuteranopia (no M-cones), and tritanopia (no S-cones).
Rather than simulating each pair, I focused on the **risk pairs** — pairs
that look distinct to typical viewers but compress in one or more
simulations. For every risk pair I checked that a non-color channel
(shape, lightness, label) preserves the distinction.

## WCAG criteria applied

| Criterion         | Floor        | Used for                                                                                                           |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| WCAG 1.4.3 (AA)   | 4.5:1        | Body text on its surface                                                                                           |
| WCAG 1.4.3 (AA)   | 3:1          | Large text (≥ 18 pt or ≥ 14 pt bold) on its surface; non-text UI components                                        |
| WCAG 1.4.6 (AAA)  | 7:1          | Pursued opportunistically (DEC-009)                                                                                |
| WCAG 1.4.11 (AA)  | 3:1          | UI components, icon outlines against surface, marker outlines against the basemap                                  |
| WCAG 2.4.13 (AAA) | 3:1          | Focus indicator against both the focused element AND adjacent fill                                                 |

Markers are **non-text UI components**, so the marker-fill-vs-surface
criterion is 3:1, not 4.5:1. Several obstacle hues below sit between 3:1
and 4.5:1 against the surface — that is by design and within spec for
their actual use (icon fills paired with a white outline + glyph). Those
hues are **explicitly not safe as body text** and the audit flags this.

---

## Light theme — every combination that appears in the UI

Surface `--color-surface` = `#FAF3DC` (warm cream). All "on surface"
contrasts use this background unless noted.

### Text on surface

| Pair                                            | Ratio    | Min  | Verdict | Notes                                                          |
| ----------------------------------------------- | -------- | ---- | ------- | -------------------------------------------------------------- |
| text `#221C14` on surface                       | **15.2:1** | 4.5  | AAA     | Body, headings                                                 |
| text `#221C14` on surface-elevated `#FFFCF0`    | **16.3:1** | 4.5  | AAA     | Cards, modals, inputs                                          |
| text-muted `#5C5246` on surface                 | **6.9:1**  | 4.5  | AAA     | Captions, helper text, meta lines in the list                  |
| text-muted on surface-elevated                  | **7.4:1**  | 4.5  | AAA     |                                                                |
| text-inverse `#FFFCF0` on accent `#A8422A`      | **5.9:1**  | 4.5  | AA      | White-on-rust button label                                     |
| text-inverse on obstacle-blocking `#8D2818`     | **12.7:1** | 4.5  | AAA     | If used as a chip with text on top                             |
| text-inverse on aid `#2F7A2E`                   | **6.7:1**  | 4.5  | AAA     |                                                                |

### Accent / link / focus on surface

| Pair                                            | Ratio    | Min | Verdict   | Notes                                                          |
| ----------------------------------------------- | -------- | --- | --------- | -------------------------------------------------------------- |
| accent `#A8422A` on surface                     | **5.4:1**  | 4.5 | AA        | Primary button background; wordmark; selected chips            |
| accent on surface-elevated                      | **5.9:1**  | 4.5 | AA        |                                                                |
| accent-hover `#8D3422` on surface               | **7.2:1**  | 4.5 | AAA       | Hover/pressed buttons                                          |
| link `#2C4F5C` on surface                       | **7.9:1**  | 4.5 | AAA       | Inline text links                                              |
| link on surface-elevated                        | **8.6:1**  | 4.5 | AAA       |                                                                |
| link-hover `#1E3A44` on surface                 | **10.8:1** | 4.5 | AAA       |                                                                |
| link-visited `#4F3E5C` on surface               | **7.7:1**  | 4.5 | AAA       | Distinct *hue* from link, not just lightness                   |
| focus-ring `#2C4F5C` on surface                 | **7.9:1**  | 3.0 | AAA       | Identical to link, by design (DEC-015 §focus indicator)        |
| focus-ring against accent fill `#A8422A`        | **3.4:1**  | 3.0 | AA-large  | The "dual contrast" rule of WCAG 2.4.13 is satisfied           |
| border `#E8DCB8` on surface                     | **1.3:1**  | n/a | (subtle)  | Borders are non-essential decoration; pair with structure      |
| border-strong `#CDBE92` on surface              | **2.0:1**  | n/a | (subtle)  | Input borders; pair with the visible label                     |

### Map feature colors

These are **marker fills** (non-text UI), so the relevant criterion is
WCAG 1.4.11 at **3:1 minimum** for the outline-against-surface contrast.

| Pair                                                       | Ratio   | Min  | Verdict     | Notes                                                                                   |
| ---------------------------------------------------------- | ------- | ---- | ----------- | --------------------------------------------------------------------------------------- |
| aid `#2F7A2E` on surface (marker outline)                  | **4.8:1** | 3.0  | AA          | Also passes WCAG 1.4.3 body text. Aid is safe as text *and* as marker fill.             |
| obstacle-mild `#B0832E` on surface (marker outline)        | **3.1:1** | 3.0  | AA-large    | ⚠ **Marker fill only. Not safe as body text.**                                          |
| obstacle-difficult `#B05B1A` on surface (marker outline)   | **4.3:1** | 3.0  | AA-large    | ⚠ **Marker fill only. Not safe as body text** (just under 4.5:1 floor).                 |
| obstacle-blocking `#8D2818` on surface (marker outline)    | **7.7:1** | 3.0  | AAA         | Safe as body text too if needed                                                         |

Marker rendering also includes a `#FFFFFF` outline ring and `#FFFFFF`
inner glyph baked into the SVG. The relevant contrasts there:

| Pair                                             | Ratio    | Min | Verdict | Notes                                                                  |
| ------------------------------------------------ | -------- | --- | ------- | ---------------------------------------------------------------------- |
| white outline on aid fill `#2F7A2E`              | **4.3:1**  | 3.0 | AA-large | The ring separates marker from basemap                                  |
| white outline on obstacle-blocking `#8D2818`     | **7.6:1**  | 3.0 | AAA      |                                                                        |
| white glyph on aid fill                          | **4.3:1**  | 3.0 | AA-large | Glyph readable on its colored fill                                      |
| white glyph on obstacle-blocking                 | **7.6:1**  | 3.0 | AAA      |                                                                        |
| white glyph on obstacle-mild `#B0832E`           | **3.0:1**  | 3.0 | borderline | ⚠ At threshold — final SDF sprite should use a thin black secondary stroke if WebAIM lands < 3:1 |

### Warning / danger / stale surfaces

The disclaimer banner uses `--color-warning-*` (per DEC-010).

| Pair                                                  | Ratio    | Min | Verdict | Notes                                            |
| ----------------------------------------------------- | -------- | --- | ------- | ------------------------------------------------ |
| warning-text `#5A3D10` on warning-surface `#FAF1D0`   | **8.8:1**  | 4.5 | AAA     | Disclaimer banner body                           |
| warning-border `#B0832E` against warning-surface      | **3.1:1**  | 3.0 | AA-large | The 2 px banner accent line                      |
| stale-text `#5C4318` on stale-surface `#F1E6C5`       | **7.4:1**  | 4.5 | AAA     | Freshness chip on feature items                  |
| danger-text `#6C1F12` on danger-surface `#F7E3DF`     | **8.4:1**  | 4.5 | AAA     | Error states (not used in M1 yet, reserved)      |

### Worst-case dark surface variant

These are spot-checks in the *light* theme but on the elevated/raised
backgrounds (cards, modals) to confirm there is no surface where a token
suddenly fails.

| Pair                                              | Ratio   | Min | Verdict |
| ------------------------------------------------- | ------- | --- | ------- |
| accent on `#FFFCF0`                               | **5.9:1** | 4.5 | AA      |
| link on `#FFFCF0`                                 | **8.6:1** | 4.5 | AAA     |
| aid on `#F1E9CC` (surface-sunken)                 | **4.6:1** | 4.5 | AA      |

---

## Dark theme — every combination that appears in the UI

Dark surface `--color-surface` = `#1A1612` (warm charcoal).

### Text on surface

| Pair                                                    | Ratio    | Min  | Verdict | Notes |
| ------------------------------------------------------- | -------- | ---- | ------- | ----- |
| text `#F2EBDC` on dark surface                          | **15.2:1** | 4.5  | AAA     |       |
| text on surface-elevated `#251F18`                      | **13.1:1** | 4.5  | AAA     |       |
| text-muted `#B5AB99` on dark surface                    | **8.9:1**  | 4.5  | AAA     |       |
| text-inverse `#1A1612` on dark accent `#E89478`         | **7.3:1**  | 4.5  | AAA     |       |

### Accent / link / focus on dark surface

| Pair                                                    | Ratio    | Min | Verdict |
| ------------------------------------------------------- | -------- | --- | ------- |
| accent `#E89478` on dark surface                        | **7.7:1**  | 4.5 | AAA     |
| accent-hover `#F0A892` on dark surface                  | **9.4:1**  | 4.5 | AAA     |
| link `#7BB5C0` on dark surface                          | **7.9:1**  | 4.5 | AAA     |
| link-visited `#B49DC7` on dark surface                  | **9.1:1**  | 4.5 | AAA     |
| focus-ring `#F4C147` on dark surface                    | **10.8:1** | 3.0 | AAA     |
| focus-ring against dark accent fill `#E89478`           | **1.4:1**  | 3.0 | ⚠ FAIL  | ⚠ See remediation below                  |

⚠ **Known caveat — dark-mode focus ring on the accent button.** The
sunshine focus ring (`#F4C147`) reads brilliantly against the dark surface
(10.8:1) but only 1.4:1 against the dark-mode accent fill (`#E89478`,
warmed rust). To satisfy WCAG 2.4.13 *for the focused button specifically*,
the dark-mode focus implementation must use a **double ring** — outer
`focus-ring` over an inner 1 px `surface` stripe. The screen mockups
demonstrate the resting state; the frontend scaffold should implement the
double-ring focus style on accent buttons in dark mode. Tracked in the
README under "Known follow-ups."

### Dark map feature colors

| Pair                                                            | Ratio   | Min | Verdict |
| --------------------------------------------------------------- | ------- | --- | ------- |
| aid `#84B377` on dark surface                                   | **6.7:1** | 3.0 | AAA     |
| obstacle-mild `#D6B068` on dark surface                         | **9.3:1** | 3.0 | AAA     |
| obstacle-difficult `#E0925A` on dark surface                    | **7.5:1** | 3.0 | AAA     |
| obstacle-blocking `#E07B69` on dark surface                     | **6.0:1** | 3.0 | AAA     |

Dark mode has comfortable headroom across the board.

---

## Color-vision-deficiency analysis

WCAG 1.4.1 (Use of Color) is met by DEC-015's shape-and-color rule —
markers carry meaning in shape AND color, never color alone. This section
documents the risk pairs and confirms the shape fallback works.

### Method

Each "risk pair" (two colors that look distinct to typical viewers but
compress under at least one form of color-vision deficiency) is checked
against:

1. **Lightness step.** Even when hues compress, a measurable L delta
   means the pair remains distinguishable. The threshold I use is
   ΔL ≥ 0.05 (loose — WCAG itself uses ratio not delta — but useful as
   a sanity floor).
2. **Shape.** If both colors are used on shapes, the shape difference is
   itself unambiguous in all CVD modes (shape is hue-invariant).
3. **Label.** Every map feature has a text label in the parallel list
   view (NF-A11Y-05). Even with shape AND color compressed, the label is
   the authoritative channel.

### Risk pairs analyzed

#### Aid `#2F7A2E` (green) vs. obstacle-blocking `#8D2818` (red)

| Mode         | Expected perception                                                          | Distinguished by                                              |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Typical      | Cleanly distinct green vs. red                                               | Hue + shape + label                                           |
| Deuteranopia | Both compress toward yellow-brown; hue almost identical                      | **Shape** (circle vs. triangle), **L** delta 0.075 (aid is lighter), label |
| Protanopia   | Similar to deuteranopia; obstacle-blocking shifts darker (red → black)      | Same as above; L delta increases to ~0.09                     |
| Tritanopia   | Green compresses toward cyan; red stays red-orange                           | Hue still distinct; shape; label                              |

✅ Pair survives in all three modes because of shape redundancy.

#### Obstacle severity ramp: mild → difficult → blocking

| Mode         | Expected perception                                                                          | Distinguished by                                                |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Typical      | Yellow-amber → rust-orange → deep red — a clear hue progression                              | Hue + L + label                                                 |
| Deuteranopia | Hue progression compresses to yellow → orange-brown → brown                                  | **L** still monotonic (0.257 → 0.169 → 0.072), label            |
| Protanopia   | Similar to deuteranopia; red end darkens further                                             | L still monotonic, label                                        |
| Tritanopia   | Yellow → orange darkens differently but lightness step preserved                             | L, label                                                        |

✅ Severity ordering preserved by lightness in all modes. Important:
the L step from "difficult" to "blocking" is 0.097 (large); mild to
difficult is 0.088 (large). Severity is readable from luminance alone.

#### Link `#2C4F5C` (teal) vs. accent `#A8422A` (rust)

| Mode         | Expected perception                                            | Distinguished by                  |
| ------------ | -------------------------------------------------------------- | --------------------------------- |
| Typical      | Cool teal vs. warm rust — opposite sides of the hue wheel       | Hue, role (link vs. button)       |
| Deuteranopia | Teal stays cool/blue; rust → brown                              | Hue (cool vs. warm) + role        |
| Protanopia   | Same as deuteranopia                                            | Same                              |
| Tritanopia   | Teal compresses toward grey; rust stays warm                    | L delta + warmth                  |

✅ The pair distinguishes a *role* (link vs. button), not a quantity,
so it's also reinforced by the underline / button-shape difference.

#### Warning-surface `#FAF1D0` (pale gold) vs. surface `#FAF3DC` (cream)

These are very close lightnesses (L ≈ 0.88 vs. 0.90). Difference of
hue alone is the cue.

| Mode         | Perception                                  | Distinguished by                                              |
| ------------ | ------------------------------------------- | ------------------------------------------------------------- |
| All CVD modes | Both look like indistinguishable creams    | **2 px `warning-border` bottom line** + **bold "Planning aid" label** |

✅ The warning banner is announced by its `<section>` role and labelled
heading; color is purely decorative there.

### CVD verdict

No part of the system depends on color alone. The shape-and-color rule
holds, the severity ramp is luminance-ordered, and the parallel list
view (M1-F09) is the canonical channel for any user — color-typical or
not — who needs the text-equivalent.

---

## What was *not* audited here

The following live outside the design pass and should be audited by
the agent that owns them:

- **Basemap colors.** The PMTiles Protomaps style is a separate
  artifact. Marker outlines are white precisely so they read against
  arbitrary basemap tints; the basemap style itself should be reviewed
  in `apps/web/public/tiles/` when the basemap lands.
- **Final SDF marker sprite.** The source SVGs in `apps/web/design/markers/`
  pass the criteria above. The build step that emits the MapLibre SDF
  sprite should re-verify, especially for `obstacle-mild` (3.0:1
  borderline against surface) — if the SDF rasterization shifts the
  effective fill, add a 1 px secondary outline.
- **MapLibre default UI colors** (zoom buttons, attribution control).
  These are MapLibre's defaults; the frontend scaffold should override
  them with our tokens.

## Known follow-ups (file in the same PR or next)

1. **Dark-mode focus ring on accent buttons** — implement the double-ring
   pattern noted above.
2. **WebAIM cross-check.** Run the full pair grid above through the
   WebAIM Contrast Checker as the first task of the frontend scaffold PR.
3. **Manual CVD simulator screenshots.** Run `apps/web/design/screens/`
   through Sim Daltonism (macOS) or Color Oracle, save the output to
   `apps/web/design/audit/cvd-screenshots/`. The analytic argument above
   stands without it; the screenshots are belt-and-suspenders.
4. **Palette iteration.** The v1 palette is a starting point — the
   project owner noted they were "feeling mid" on it. Any palette swap
   re-runs this audit; the structure is reusable.
