/** Plain translation strings for English UI (M2 wires next-intl). */

export type LocaleMessages = Record<string, string>;

export const en: LocaleMessages = {
  locale: "en",
  scoutTitle: "Scout — walking routes and accessibility data for DC",
  /** M1-F02: short aria-label fragment (≤10 words, PRD §6.1 + voice-and-copy §9.2). */
  mapPlanAriaLabel: "Interactive map of Washington, DC",
  /** Paired keyboard hint; surfaced via aria-describedby on the application landmark. */
  mapPlanKeyboardHint: "Tab to reach map controls. Press M then arrow keys to pan.",
};
