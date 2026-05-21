import { describe, expect, it } from "vitest";

import {
  ONBOARDING_KEY,
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "./onboarding-storage";

describe("hasCompletedOnboarding", () => {
  it("returns false before onboarding is persisted", () => {
    window.localStorage.removeItem(ONBOARDING_KEY);
    expect(hasCompletedOnboarding()).toBe(false);
  });
});

describe("markOnboardingComplete", () => {
  it("persists onboarding completion", () => {
    window.localStorage.removeItem(ONBOARDING_KEY);
    expect(hasCompletedOnboarding()).toBe(false);

    markOnboardingComplete();

    expect(hasCompletedOnboarding()).toBe(true);
  });
});
