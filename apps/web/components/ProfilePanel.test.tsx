import type { ApiCategory } from "@/lib/api";

import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import ProfilePanel from "./ProfilePanel";

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

const PANEL_SAMPLE: ApiCategory[] = [
  {
    id: "rest_spots",
    label: "Rest spots",
    description: "Benches.",
    kind: "aid",
    default_enabled: true,
  },
];

describe("ProfilePanel", () => {
  beforeEach(() => {
    void stubCategoriesPayload(PANEL_SAMPLE);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("opens the Radix accessibility profile modal", async () => {
    const user = userEvent.setup();

    const { baseElement } = render(
      <AnnounceProvider>
        <ProfileProvider>
          <ProfilePanel />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByText(/loading categories/i)).not.toBeInTheDocument(),
    );
    const triggers = screen.getAllByRole("button", {
      name: /^accessibility profile$/i,
    });

    await user.click(triggers[0]);

    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: /^accessibility profile$/i }),
      ).toBeVisible(),
    );

    const results = await axe(baseElement);

    expect(results.violations).toStrictEqual([]);
  });
});
