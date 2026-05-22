import { describe, expect, it } from "vitest";

import { en } from "./messages";

describe("English UI strings scaffold", () => {
  it("exports locale metadata alongside marketing title", () => {
    expect(`${en.locale} ${en.scoutTitle}`).toMatch(
      /walking routes and accessibility data/,
    );
  });
});
