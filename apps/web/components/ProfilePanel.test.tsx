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

function renderPanel() {
  return render(
    <AnnounceProvider>
      <ProfileProvider>
        <ProfilePanel />
      </ProfileProvider>
    </AnnounceProvider>,
  );
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.queryByText(/loading categories/i)).not.toBeInTheDocument(),
  );
  const trigger = screen.getByRole("button", { name: /^my accessibility needs$/i });
  await user.click(trigger);
  await waitFor(() =>
    expect(
      screen.getByRole("dialog", { name: /^accessibility profile$/i }),
    ).toBeVisible(),
  );
  return trigger;
}

describe("ProfilePanel", () => {
  beforeEach(() => {
    void stubCategoriesPayload(PANEL_SAMPLE);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("opens the Radix accessibility profile modal from the needs trigger", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderPanel();

    await openPanel(user);

    const results = await axe(baseElement);
    expect(results.violations).toStrictEqual([]);
  });

  it("announces the category and its new state when a checkbox toggles", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openPanel(user);

    await user.click(screen.getByRole("checkbox", { name: /rest spots/i }));

    expect(await screen.findByText(/rest spots turned off\./i)).toBeInTheDocument();
  });

  it("announces a reset when 'Reset to defaults' is activated", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: /reset to defaults/i }));

    expect(
      await screen.findByText(/preferences reset to defaults\./i),
    ).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderPanel();
    const trigger = await openPanel(user);

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
