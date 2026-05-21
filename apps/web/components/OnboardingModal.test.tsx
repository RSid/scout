import type { ApiCategory } from "@/lib/api";

import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import OnboardingModal from "./OnboardingModal";

import { ONBOARDING_KEY } from "@/lib/onboarding-storage";
import { ProfileProvider } from "@/lib/profile";

async function stubCategoriesPayload(categories: ApiCategory[]): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (resource: RequestInfo) => {
      const url = String(resource);

      if (url.endsWith("/api/categories")) {
        return {
          ok: true,
          json: async () => ({ categories }),
        } satisfies Partial<Response>;
      }

      throw new Error(`Unhandled fetch(${url})`);
    }),
  );
}

const ONBOARD_SAMPLE: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "Sidewalk transitions.",
    kind: "aid",
    default_enabled: true,
  },
];

describe("OnboardingModal", () => {
  beforeEach(() => {
    void stubCategoriesPayload(ONBOARD_SAMPLE);
    window.localStorage.removeItem(ONBOARDING_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem(ONBOARDING_KEY);
  });

  it("reveals onboarding until dismissed", async () => {
    const user = userEvent.setup();

    const { baseElement } = render(
      <AnnounceProvider>
        <ProfileProvider>
          <OnboardingModal />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await screen.findByRole("heading", { name: /^meet scout previews$/i });

    await user.click(screen.getByRole("button", { name: /^not now$/i }));

    await waitFor(() => expect(window.localStorage.getItem(ONBOARDING_KEY)).toBe("true"));

    const results = await axe(baseElement);

    expect(results.violations).toStrictEqual([]);
  });
});
