# Manual QA Plan — scout-dc.com/plan

## Context

Scout is an accessibility-aware route planner for Washington, DC. The `/plan` page is the core experience. We're smoke-testing ahead of alpha release, looking for **broken features** (Cat 1) and **weird/poor UX** (Cat 2). This plan is designed to be handed off to agents who will navigate the live site at `https://scout-dc.com/plan` using browser automation tools.

---

## Test Environment Setup

- **URL**: `https://scout-dc.com/plan`
- **Viewports**: Desktop (1280x800), Mobile (375x812), Small mobile (320x568)
- **Prep**: Clear localStorage before each full run (to trigger onboarding modal)
- **Dark mode**: Test with `prefers-color-scheme: dark` emulation

---

## QA-01: First Visit — Onboarding Modal

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Navigate to `/plan` with cleared localStorage | Onboarding modal appears ("Set up your accessibility profile") | 1 |
| 2 | Verify modal has category checkboxes | ~9 toggleable categories shown (aids + obstacles) | 1 |
| 3 | Toggle a few categories, click "Save and continue" | Modal closes. Feature list updates to reflect selections. | 1 |
| 4 | Reload the page | Onboarding modal does NOT reappear (localStorage `scout:onboarding` = "true") | 1 |
| 5 | Re-clear localStorage, open modal, click "Not now" | Modal closes without saving. Defaults are used. | 2 |
| 6 | Click "Reset to defaults" link inside modal | Categories revert to their default_enabled states | 2 |
| 7 | On mobile (375px), verify modal is scrollable and buttons are reachable | Modal should not overflow viewport; buttons visible without horizontal scroll | 2 |

---

## QA-02: Disclaimer Banner

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Load `/plan` (after onboarding dismissed) | Yellow disclaimer banner visible at top of page | 1 |
| 2 | Click the "x" dismiss button | Banner hides for rest of session | 1 |
| 3 | Reload the page in same session | Banner stays hidden (sessionStorage) | 2 |
| 4 | Open a new tab / clear sessionStorage, reload | Banner reappears | 2 |
| 5 | Navigate to `/about` | Banner is NOT shown on About page | 2 |

---

## QA-03: Sample Route (Default State)

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Load `/plan` without entering addresses | Sample route displayed on map, sample data in feature list | 1 |
| 2 | Check Route Summary card | Shows distance/duration numbers (not "—" or placeholders) with "Wheelchair" profile | 1 |
| 3 | Check Status Strip | Blue info strip: "Sample route" message explaining pick start/destination | 1 |
| 4 | Verify feature list has items | List is populated with corridor features from the sample route | 1 |

---

## QA-04: Address Autocomplete — Start Point

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Click "Starting point" input, type "Dup" (< 3 chars) | No suggestions appear yet | 1 |
| 2 | Type "Dupo" (>= 3 chars), wait 500ms | Suggestions dropdown appears with DC addresses | 1 |
| 3 | Verify max 5 suggestions shown | At most 5 results in the dropdown | 2 |
| 4 | Select a suggestion (click or keyboard Enter) | Input fills with selected address label. No duplicate search fires. | 1 |
| 5 | Type a nonsense string like "zzzzzzzzz" | "We currently support Washington, DC addresses only." hint appears after suggestions come back empty | 2 |
| 6 | Type 2 chars, then quickly type more | Previous in-flight request is aborted (no stale results flash) | 1 |
| 7 | Check the "Show suggestions" (down-caret) button | Clicking it opens/toggles the suggestion popover | 2 |

---

## QA-05: "Use My Location" Button

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Verify "Use my location" button visible on Start input only | Button present for Starting point, absent for Destination | 1 |
| 2 | Click "Use my location" (allow geolocation) | "Locating your position..." shown, then input fills with reverse-geocoded address | 1 |
| 3 | Click "Use my location" (deny geolocation) | Error: "Location access is blocked for this site..." shown in red | 1 |
| 4 | Test on HTTP (insecure context) if possible | Error: "Location requires a secure connection..." | 2 |
| 5 | While locating, verify button is disabled | Button should show disabled/dimmed state | 2 |

---

## QA-06: Address Autocomplete — Destination

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Type "Union Station" in Destination | Suggestions appear; pick one | 1 |
| 2 | Verify no "Use my location" button on Destination | Should not be present | 2 |
| 3 | With both Start and Destination set | Route fetching begins (status strip changes to pending spinner) | 1 |

---

## QA-07: Route Fetching & Summary

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Set both Start and Destination to valid DC addresses | Status strip shows pending spinner ("Planning your route...") | 1 |
| 2 | Wait for route to resolve | Route Summary updates with real distance (meters/km) and duration (minutes). Status strip disappears. | 1 |
| 3 | Check route drawn on map | Blue/purple route line appears on the map following streets | 1 |
| 4 | Change the destination to a new address | Old route clears; new pending state; new route appears | 1 |
| 5 | If route API fails (e.g., unreachable backend) | Yellow warning strip: "Directions unavailable". Summary shows "Unavailable" placeholders. Corridor features still load via straight-line fallback. | 1 |
| 6 | If wheelchair profile fell back to walking | Summary shows fallback note about wheelchair routing | 2 |
| 7 | Check for route warnings (warning chips below summary) | If present, they should render as yellow bordered pills | 2 |

---

## QA-08: Corridor Features (Feature List)

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | After route loads, check feature list heading | "Along this route (N)" where N is count of point features | 1 |
| 2 | Expand a feature row (click the details summary) | Shows: category description, condition, kind (Support/Obstacle), along-route distance, inspection year, freshness treatment | 1 |
| 3 | Check freshness chip logic — feature inspected > 3 years ago | Yellow warning chip: "Last inspected YYYY" | 2 |
| 4 | Check freshness — inspected 1-3 years ago | Subtle text: "As of YYYY" (no chip) | 2 |
| 5 | Check freshness — inspected within 1 year | No freshness indicator | 2 |
| 6 | Check freshness — unknown inspection year | "Inspection date unknown" text | 2 |
| 7 | Click "Open on map" button inside an expanded feature | Map scrolls into view (on mobile), marker is selected/highlighted on map | 1 |
| 8 | Verify features are sorted by along_route_meters | Items closer to start appear first | 2 |
| 9 | If corridor API fails | Red error box in feature list area; red status strip at top | 1 |
| 10 | If corridor returns 0 features | Empty state: "No accessibility features found..." dashed-border box | 2 |

---

## QA-09: Interactive Map

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Verify map loads (not stuck on "Loading map..." placeholder) | MapLibre canvas renders with DC base tiles | 1 |
| 2 | Pan and zoom the map | Smooth interaction, tiles load without blanking | 1 |
| 3 | Verify route line is drawn on map | Colored line following streets between start and destination | 1 |
| 4 | Verify corridor feature markers appear on map | Colored markers (green for aids, yellow/orange/red for obstacles) | 1 |
| 5 | Click a marker on the map | Popup appears with feature details | 1 |
| 6 | Verify marker clustering works | When zoomed out, markers cluster into numbered circles | 2 |
| 7 | Check map attribution | Attribution links present and legible | 2 |
| 8 | Verify map zoom controls are at least 44x44px | Meets WCAG 2.5.5 target size | 2 |

---

## QA-10: Mobile Layout

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | At 375px width, verify "Show map" / "Hide map" toggle is visible | Button appears above map area (hidden on desktop) | 1 |
| 2 | Click "Show map" | Map panel expands; button text changes to "Hide map"; `aria-expanded="true"` | 1 |
| 3 | Click "Hide map" | Map panel collapses; `aria-expanded="false"` | 1 |
| 4 | Click "Open on map" from a feature row | Map auto-expands (if hidden), scrolls into view smoothly | 1 |
| 5 | Resize from mobile to desktop (>= 768px) | Map becomes always-visible; toggle button hides. No layout jump. | 2 |
| 6 | Resize from desktop back to mobile | Map collapses; toggle button reappears | 2 |
| 7 | At 320px width, check nothing overflows horizontally | No horizontal scrollbar on body; all content fits | 2 |
| 8 | Verify all tap targets are >= 44px | Buttons, inputs, list items all meet minimum touch size | 2 |

---

## QA-11: Profile Dialog (Post-Onboarding)

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Click "My accessibility needs" button in header | Profile dialog opens with category toggles | 1 |
| 2 | Toggle a category off, click "Save" | Dialog closes. Feature list re-fetches with updated categories. Markers on map update. | 1 |
| 3 | Click "Reset to defaults" then "Save" | All categories revert to defaults, list updates | 1 |
| 4 | Open dialog, make changes, press Escape (don't save) | Dialog closes. Changes are NOT persisted (verify by reopening). | 2 |
| 5 | If localStorage is blocked (private browsing) | Warning: "Preferences won't be saved on this device." shown in dialog | 2 |
| 6 | Verify dialog has close button (x) with proper aria-label | `aria-label="Close profile dialog"` | 2 |
| 7 | Verify dialog overlay blocks interaction behind | Clicking the overlay closes the dialog | 2 |

---

## QA-12: Status Strip States

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Initial load (sample route) | Blue info strip with "Sample route" message | 1 |
| 2 | After entering both addresses | Yellow pending spinner: "Planning your route..." | 1 |
| 3 | After route loads successfully | Strip disappears entirely | 1 |
| 4 | If route fails | Yellow warning strip: "Directions unavailable" with explanation | 1 |
| 5 | If corridor fetch fails | Red error strip: error title with detail text | 1 |
| 6 | Verify strip is sticky (top: 0) | As user scrolls, strip stays pinned to top | 2 |

---

## QA-13: Rapid Input / Race Conditions

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Enter start address, then quickly change destination 3 times | Only the final route is shown; no flicker between intermediate results | 1 |
| 2 | Type in autocomplete, then quickly clear and retype | No stale suggestion lists appear; AbortController cancels old requests | 1 |
| 3 | Select a suggestion, verify input doesn't re-trigger search | `suppressNextSearch` ref prevents duplicate geocode call after selection | 1 |

---

## QA-14: Dark Mode

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Enable `prefers-color-scheme: dark` | Page switches to dark theme; map tiles adjust | 2 |
| 2 | Verify text contrast in dark mode | All text readable against dark backgrounds | 2 |
| 3 | Verify status strip colors in dark mode | Info (blue), warning (yellow), error (red) still distinguishable | 2 |
| 4 | Verify focus rings visible in dark mode | Focus outlines have sufficient contrast (AAA target) | 2 |
| 5 | Verify profile dialog in dark mode | Dialog has border, overlay is darker, text is legible | 2 |

---

## QA-15: Footer & Navigation

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Scroll to bottom of `/plan` page | Footer visible with 5 links | 1 |
| 2 | Click "About Scout" | Navigates to `/about` | 1 |
| 3 | Click "Route planner" | Navigates to `/plan` (or stays, since already there) | 2 |
| 4 | Click "Privacy policy" | Navigates to `/privacy` | 1 |
| 5 | Click "Accessibility statement" | Navigates to `/accessibility` | 1 |
| 6 | Click "Source on GitHub" | Opens GitHub repo in new tab | 1 |

---

## QA-16: Keyboard & Screen Reader Accessibility

| # | Step | Expected | Cat |
|---|------|----------|-----|
| 1 | Tab through the page from top | Focus order: skip link -> disclaimer -> header -> profile button -> route summary -> status strip -> start input -> destination input -> feature list -> map -> footer | 2 |
| 2 | Use skip link | "Skip to main content" link jumps focus to main | 2 |
| 3 | Use "Skip to list" link above map | Focus jumps to feature list section | 2 |
| 4 | Navigate autocomplete with keyboard | Arrow keys move through suggestions; Enter selects; Escape closes | 1 |
| 5 | Open/close profile dialog with keyboard | Enter/Space opens; Escape closes; focus returns to trigger | 2 |
| 6 | Verify ARIA live announcements | Status changes, route load, feature count — all announced via live region | 2 |
| 7 | Expand feature row with keyboard | Enter/Space on summary toggles details open/closed | 2 |

---

## Agent Execution Notes

- **Browser tool mapping**: Use `preview_start` to load the dev server, or `navigate` to hit the live URL directly via chrome tools. Use `preview_snapshot` / `read_page` for structure checks, `preview_inspect` for CSS verification, `preview_screenshot` for visual checks.
- **localStorage manipulation**: Use `preview_eval` / `javascript_tool` to run `localStorage.clear()` before first-visit tests.
- **Viewport switching**: Use `preview_resize` with presets `mobile` (375x812), `desktop` (1280x800), or custom dimensions.
- **Dark mode**: Use `preview_resize` with `colorScheme: "dark"`.
- **Each QA section is independent** — agents can run sections in parallel.
- **Reporting**: For each step, report PASS / FAIL / SKIP with a one-line note. Screenshot on any FAIL.
