/** Plain translation strings for English UI (M2 wires next-intl). */

export type LocaleMessages = Record<string, string>;

export const en: LocaleMessages = {
  locale: "en",
  scoutTitle: "Scout — walking routes and accessibility data for DC",
  /** Exact strings for M1-F02 WCAG pairing; keep `scout-map-keyboard-hint` in sync. */
  mapPlanAriaLabel:
    "Interactive map of Washington, DC; press Tab to access controls; press M then arrow keys to pan",
  mapPlanKeyboardHint: "Tab to reach map controls. Press M then arrow keys to pan.",
};
