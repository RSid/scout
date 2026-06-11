import { afterEach, describe, expect, it } from "vitest";

import { colorVar, lightTheme, resolveColorToken } from "./colors";

describe("colorVar", () => {
  it("returns the css variable reference for css consumers", () => {
    expect(colorVar("accent")).toBe("var(--color-accent)");
  });
});

describe("resolveColorToken", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("never returns a `var(--…)` string — MapLibre's GL color parser rejects those, which silently drops the entire layer (regression: M1-F05 invisible route line)", () => {
    const value = resolveColorToken("accent");
    expect(value.startsWith("var(")).toBe(false);
  });

  it("prefers the live CSS custom property on <html> so theme overrides win", () => {
    document.documentElement.style.setProperty("--color-accent", "#123456");
    expect(resolveColorToken("accent")).toBe("#123456");
  });

  it("falls back to the baked light-theme hex when the CSS var is unset (jsdom default, SSR)", () => {
    expect(resolveColorToken("accent")).toBe(lightTheme.accent);
  });
});
