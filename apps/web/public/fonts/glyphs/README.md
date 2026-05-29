# Map glyphs (MapLibre SDF font PBFs)

MapLibre renders on-map text (`text-field` layers — our cluster count and the
supports/obstacles breakdown) from **signed-distance-field glyph PBFs**, not
from web fonts. Without these files the cluster labels render nothing.

These are self-hosted to satisfy `NF-PRIV-01` (no font CDN — a glyph CDN would
leak user IPs the same way a web-font CDN does).

## What lives here

```
glyphs/
└── Atkinson Hyperlegible Regular/   ← folder name MUST match the font stack
    └── 0-255.pbf                     ← Basic Latin + Latin-1 (digits, a–z, "·")
```

- The folder name **must** equal the `text-font` value used in
  `apps/web/components/BasemapInner.tsx` (`SCOUT_MAP_FONT_STACK =
"Atkinson Hyperlegible Regular"`). The style's `glyphs` URL
  (`/fonts/glyphs/{fontstack}/{range}.pbf`) substitutes that string for
  `{fontstack}`.
- Only the `0-255` range is needed: our labels use digits, lowercase Latin, a
  space, and the middle dot `·` (U+00B7), all within Basic Latin + Latin-1
  Supplement. MapLibre requests other ranges only if text needs them.

## License

Generated from **Atkinson Hyperlegible Regular** (© Braille Institute of
America, SIL Open Font License 1.1 — see `../OFL.txt`). OFL permits format
conversion and self-hosted redistribution. The TTF source is
`fonts/ttf/AtkinsonHyperlegible-Regular.ttf` in
[googlefonts/atkinson-hyperlegible](https://github.com/googlefonts/atkinson-hyperlegible).

> Do **not** substitute glyphs from sources with incompatible licenses (e.g.
> MapGlyphs is CC BY-ND and is an icon font, not a text font — it cannot render
> letters or digits).

## How to (re)generate

The PBFs are committed alongside the woff2 fonts; regenerate only when the
font changes.

1. **Browser tool (no toolchain):** open <https://apparatus.run/font-to-pbf>,
   upload `fonts/ttf/AtkinsonHyperlegible-Regular.ttf`, convert, download the
   zip, and place `0-255.pbf` under the folder named exactly
   `Atkinson Hyperlegible Regular/`.
2. **CLI (needs Rust):** `cargo install build_pbf_glyphs` then
   `build_pbf_glyphs <dir-with-the-ttf> apps/web/public/fonts/glyphs`.

After placing the files, hard-reload `/plan`; the cluster bubbles should show
the total count and a "N supports · N obstacles" line.
