/**
 * Trust-copy strings for disclaimers.
 *
 * See `docs/contributor/voice-and-copy.md` §8 (trust ladder) and PRD §7.4
 * (NF-TRUST-01). Both strings are documented verbatim in PRD §7.4 so the
 * spec and the shipped strings stay in lockstep.
 */

/** L2 — standing reminder banner (dismissible per session, per DEC-010). */
export const DISCLAIMER_L2_COPY =
  "Scout is in active development, and may still have some rough edges! Additionally, data is from public sources and may not be fully up to date.";

/** Self-describing link text from the L2 banner to the L1 disclosure. */
export const DISCLAIMER_L2_LINK_TEXT = "About this data";
