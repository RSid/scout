/**
 * Trust-copy strings for the L1 and L2 disclaimer surfaces.
 *
 * See `docs/contributor/voice-and-copy.md` §8 (trust ladder) and PRD §7.4
 * (NF-TRUST-01). Both strings are documented verbatim in PRD §7.4 so the
 * spec and the shipped strings stay in lockstep.
 */

/** L1 — full disclosure, rendered at `/about#disclaimer`. */
export const DISCLAIMER_L1_COPY =
  "Scout shows public accessibility data alongside walking routes. Some of that data is years old, and the streets may have changed. Use Scout to plan, and check what matters most before you go.";

/** L2 — standing reminder banner (dismissible per session, per DEC-010). */
export const DISCLAIMER_L2_COPY =
  "Scout's accessibility data is from public sources and may be out of date.";

/** Self-describing link text from the L2 banner to the L1 disclosure. */
export const DISCLAIMER_L2_LINK_TEXT = "About this data";
