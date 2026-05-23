import { describe, expect, it } from "vitest";

import { en } from "./messages";

describe("English UI strings scaffold", () => {
  it("gates the verbatim M1-F02 map narration strings behind stable keys", () => {
    expect(en.mapPlanAriaLabel).toBe("Interactive map of Washington, DC");
    expect(en.mapPlanKeyboardHint).toBe(
      "Tab to reach map controls. Press M then arrow keys to pan.",
    );
  });

  it("exports locale metadata alongside marketing title", () => {
    expect(`${en.locale} ${en.scoutTitle}`).toMatch(
      /walking routes and accessibility data/,
    );
  });
});
