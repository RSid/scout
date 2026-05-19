# apps/web/AGENTS.md

Frontend conventions. Read `../../AGENTS.md` first.

## Stack and tooling

- **Node ≥ 20**, **`pnpm`** for installs.
- **TypeScript strict.** `"strict": true`, `"noUncheckedIndexedAccess": true`,
  `"noImplicitOverride": true`. No `any` without an
  `// eslint-disable-next-line ... — <reason>` comment.
- **Next.js 15 (App Router)** + **React** + **Tailwind**.
- **ESLint + Prettier** for lint and format. `eslint-plugin-jsx-a11y` is
  enabled; its warnings are errors in CI.
- **Vitest + React Testing Library + jest-axe** for unit. **Playwright +
  `@axe-core/playwright`** for E2E.
- **MapLibre GL JS** for maps (DEC-002). Not Mapbox.

## React patterns

- **Functional components only.** No classes.
- **Server Components by default** (App Router). Add `"use client"` only
  when the component needs interactivity, browser APIs, or stateful effects.
- **Hooks for shared logic.** Extract custom hooks (`useProfile`,
  `useRouteQuery`) when behavior is reused across components.
- **No global state libraries.** Redux, MobX, Zustand, Recoil all excluded.
  React Context for genuinely-shared client state (the user's accessibility
  Profile is the canonical example). `localStorage` for cross-session
  persistence (DEC-016, `NF-PRIV-03`).
- **Server-side data fetching prefers RSC** (`async` Server Components).
  Client fetching uses the typed `lib/api.ts` wrapper around `fetch`.
- **Avoid `useEffect` for derived state.** If you can compute it during
  render, do.
- **Memoize only when measured.** No reflexive `useMemo` / `useCallback`.

## Files and folders

- One component per file. Filename matches the default export:
  `BasemapView.tsx`.
- Colocate tests: `BasemapView.test.tsx` next to `BasemapView.tsx`.
- Hooks live in `lib/hooks/` or alongside their consumer component if private
  to it.
- `index.ts` barrel files only at directory boundaries that genuinely benefit
  from one. Avoid them as a default.

## Accessibility (code-level)

The full spec is PRD §7.1. Code-level rules:

- **Use `@react-aria/` or Radix primitives** for Dialog, Combobox, Popover,
  Menu, Tabs. Do not hand-roll focus management.
- **Every interactive element is keyboard reachable** and announces its
  state.
- **Color is never the sole signal.** Shape + color, or label + color.
- **Visible focus indicator** with ≥ 3:1 contrast against both the element
  and the background.
- **Honor `prefers-reduced-motion`** (no animated panning, no slide-in toasts
  when it's set) and **`prefers-color-scheme`** (the design tokens have dark
  variants).
- **Touch targets ≥ 44×44 px** (WCAG 2.5.5).
- **Forms**: labels are programmatic (`<label for>` or `aria-labelledby`),
  errors are inline AND announced via the shared `<LiveRegion/>`.
- **Unit tests for components include a jest-axe assertion**: `expect(await
  axe(container)).toHaveNoViolations()`.
- **E2E tests for every route include an axe scan.**

## Tailwind and design tokens

- Reference semantic tokens (CSS custom properties from
  `apps/web/design/tokens/colors.css`) — never raw hex.
- Use Tailwind for layout and one-off utilities; extract to a component or a
  CSS module when a class string exceeds ~8 utilities or repeats in three or
  more places.
- No `!important`. If you reach for it, the cascade is wrong.

## API client (`lib/api.ts`)

- A single typed wrapper around `fetch` calling the FastAPI backend.
- One function per endpoint; the function's return type is the response
  shape (or it throws a typed `ScoutApiError`).
- Translate backend error codes (`{error: {code, message}}`) to typed
  `ScoutApiError` instances at the wrapper boundary.

## Tests

- One behavior per test. Single `expect` preferred per test. Parameterize
  with `test.each`.
- **Test what the user observes.** RTL queries: `getByRole`, `getByLabelText`,
  `getByText`. Avoid `getByTestId` and snapshot tests as defaults.
- 80%+ coverage on `components/` and `lib/`.
- Playwright E2E covers: happy path, keyboard-only navigation, axe scan of
  every route, mobile viewport (375 px).
- Mocks obey the visibility rule in the root `AGENTS.md` (rule #3).

## Don'ts

- Don't add Redux / Zustand / MobX / Recoil.
- Don't use `mapbox-gl` — use MapLibre (DEC-002).
- Don't load fonts from Google Fonts or any third-party CDN
  (`NF-PRIV-01`). Self-host under `apps/web/public/fonts/`.
- Don't add third-party analytics or telemetry in M1.
- Don't render the map server-side.
- Don't use `next/image` for map markers — use the SVG sprite layer in
  MapLibre.
- Don't import from `apps/backend/`. The contract is the HTTP API.
