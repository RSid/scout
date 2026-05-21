/**
 * Typed mirror of the CSS color tokens in `./colors.css`.
 *
 * Two ways to consume colors in the frontend:
 *
 * 1. **CSS / Tailwind** — reference the CSS variables: `var(--color-accent)`.
 *    This is the canonical path; theme switching and `prefers-color-scheme`
 *    happen at the CSS layer with zero JS cost.
 *
 * 2. **TypeScript** — import `colorVar("accent")` to get the `"var(--color-accent)"`
 *    string. Use this when constructing inline styles for MapLibre paint specs,
 *    SVG fills computed at runtime, or canvas-rendered components. Never embed
 *    raw hex in TS components.
 *
 * The raw hex literals are exported as `lightTheme` / `darkTheme` purely for the
 * design-time audit report and tooling. **Components must not import these.**
 */

export type ColorToken =
  | "surface"
  | "surface-elevated"
  | "surface-sunken"
  | "text"
  | "text-muted"
  | "text-inverse"
  | "border"
  | "border-strong"
  | "accent"
  | "accent-hover"
  | "accent-pressed"
  | "on-accent"
  | "link"
  | "link-hover"
  | "link-visited"
  | "focus-ring"
  | "aid"
  | "obstacle-mild"
  | "obstacle-difficult"
  | "obstacle-blocking"
  | "warning-surface"
  | "warning-border"
  | "warning-text"
  | "danger-surface"
  | "danger-border"
  | "danger-text"
  | "stale-surface"
  | "stale-text";

/** Returns the CSS variable reference for a token: `"var(--color-accent)"`. */
export function colorVar(token: ColorToken): string {
  return `var(--color-${token})`;
}

/**
 * Raw hex values per theme. **Design-time only** — for audit reports, Storybook
 * background swatches, and the contrast-check tooling. Component code must not
 * import these; it must use `colorVar()` or CSS variables so palette swaps
 * propagate without component edits.
 */
export const lightTheme: Readonly<Record<ColorToken, string>> = {
  surface: "#faf3dc",
  "surface-elevated": "#fffcf0",
  "surface-sunken": "#f1e9cc",
  text: "#221c14",
  "text-muted": "#5c5246",
  "text-inverse": "#fffcf0",
  border: "#e8dcb8",
  "border-strong": "#cdbe92",
  accent: "#a8422a",
  "accent-hover": "#8d3422",
  "accent-pressed": "#732a1c",
  "on-accent": "#fffcf0",
  link: "#2c4f5c",
  "link-hover": "#1e3a44",
  "link-visited": "#4f3e5c",
  "focus-ring": "#2c4f5c",
  aid: "#2f7a2e",
  "obstacle-mild": "#b0832e",
  "obstacle-difficult": "#b05b1a",
  "obstacle-blocking": "#8d2818",
  "warning-surface": "#faf1d0",
  "warning-border": "#b0832e",
  "warning-text": "#5a3d10",
  "danger-surface": "#f7e3df",
  "danger-border": "#8d2818",
  "danger-text": "#6c1f12",
  "stale-surface": "#f1e6c5",
  "stale-text": "#5c4318",
};

export const darkTheme: Readonly<Record<ColorToken, string>> = {
  surface: "#1a1612",
  "surface-elevated": "#251f18",
  "surface-sunken": "#120f0c",
  text: "#f2ebdc",
  "text-muted": "#b5ab99",
  "text-inverse": "#1a1612",
  border: "#3a322a",
  "border-strong": "#5c5246",
  accent: "#e89478",
  "accent-hover": "#f0a892",
  "accent-pressed": "#d87f63",
  "on-accent": "#1a1612",
  link: "#7bb5c0",
  "link-hover": "#9bcad2",
  "link-visited": "#b49dc7",
  "focus-ring": "#f4c147",
  aid: "#84b377",
  "obstacle-mild": "#d6b068",
  "obstacle-difficult": "#e0925a",
  "obstacle-blocking": "#e07b69",
  "warning-surface": "#2e2620",
  "warning-border": "#d6b068",
  "warning-text": "#f0d89a",
  "danger-surface": "#2e1a18",
  "danger-border": "#e07b69",
  "danger-text": "#f5b9ad",
  "stale-surface": "#2a2418",
  "stale-text": "#d6b068",
};
