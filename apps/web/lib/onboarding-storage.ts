"use client";

const ONBOARDING_KEY = "scout.onboarded.v1";

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function markOnboardingComplete(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ONBOARDING_KEY, "true");
}

export { ONBOARDING_KEY };
