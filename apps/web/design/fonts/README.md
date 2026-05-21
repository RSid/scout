# Fonts

Scout self-hosts a single font family — **Atkinson Hyperlegible**
(© Braille Institute of America, distributed under the SIL Open Font
License v1.1).

Loaded from `apps/web/public/fonts/` and declared via `@font-face` in
`apps/web/design/tokens/typography.css`. Per `NF-PRIV-01` (and DEC-015
non-negotiable constraints) **no third-party CDNs**.

## Why Atkinson Hyperlegible

Designed by the Braille Institute for readers with low vision: open
apertures, disambiguated letterforms (a vs. o, 1 vs. l vs. I, 0 vs. O),
high x-height. The design prompt
(`docs/prompts/07-design-system.md`) names it as a leading candidate
for that exact reason. Aligns directly with Scout's primary persona.

## How the fonts get into the repo

Run `scripts/fetch_fonts.sh` from the repo root. The script downloads
four `.woff2` files (Regular, Bold, Italic, BoldItalic — ~96 KB total)
plus the SIL OFL license text from the upstream
[googlefonts/atkinson-hyperlegible](https://github.com/googlefonts/atkinson-hyperlegible)
repository into `apps/web/public/fonts/`.

The script is idempotent: re-running with files present prints
`skipped: 4` and exits 0. Use `--force` to re-download.

## License

SIL Open Font License v1.1. Free for embedding, modification, and
redistribution. Original copyright: © 2020-2021 Braille Institute of
America, Inc. The full license is fetched as `OFL.txt` alongside the
font files. **Do not delete `OFL.txt`** — the OFL requires that
redistributions ship with the license.

## Source files vs. the design folder

This README lives in `apps/web/design/fonts/` because the design layer
is what _specifies_ the font choice and the `@font-face` declaration.
The actual binary `.woff2` files live in `apps/web/public/fonts/` so
Next.js serves them at the `/fonts/*` URL the `@font-face` references.

## How to change the typeface

A typeface swap is a meaningful design change (DEC-015 marks the
typeface choice as part of the locked design surface). Open a
follow-up `DEC-NNN` proposal first; do not silently swap.

If approved:

1. Update `scripts/fetch_fonts.sh` to point at the new source.
2. Update `@font-face` declarations in `tokens/typography.css`.
3. Update this README and `tokens/typography.css`'s header comment.
4. Re-run the contrast / readability audit on the screen mockups —
   different typefaces have different perceived weight and may need
   adjustments to `--line-height-*` to maintain the cognitive
   accessibility floor in DEC-009.
