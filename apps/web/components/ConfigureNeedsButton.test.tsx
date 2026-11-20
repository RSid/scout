import type { ApiCategory } from "@/lib/api";

import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import ConfigureNeedsButton from "./ConfigureNeedsButton";

import { ProfileProvider } from "@/lib/profile";

const push = vi.fn();

// MOCK: next/navigation's App Router context isn't mounted under Vitest; capture push() calls.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const SAMPLE: ApiCategory[] = [
  {
    id: "rest_spots",
    label: "Rest spots",
    description: "Benches.",
    kind: "aid",
    default_enabled: true,
  },
];

function renderButton() {
  return render(
    <AnnounceProvider>
      <ProfileProvider>
        <ConfigureNeedsButton />
      </ProfileProvider>
    </AnnounceProvider>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.queryByText(/loading categories/i)).not.toBeInTheDocument(),
  );
  await user.click(
    screen.getByRole("button", { name: /^configure accessibility needs$/i }),
  );
  await screen.findByRole("dialog", { name: /^accessibility profile$/i });
}

describe("ConfigureNeedsButton", () => {
  beforeEach(() => {
    // MOCK: stub the backend /api/categories response the profile loads on mount.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (resource: RequestInfo) => {
        const url = String(resource);
        if (url.endsWith("/api/categories")) {
          return {
            ok: true,
            json: async () => ({ categories: SAMPLE }),
          } satisfies Partial<Response>;
        }
        throw new Error(`Unhandled fetch(${url})`);
      }),
    );
    window.localStorage.clear();
  });

  afterEach(() => {
    push.mockReset();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("opens the accessibility profile dialog without axe violations", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderButton();

    await openDialog(user);

    const results = await axe(baseElement);
    expect(results.violations).toStrictEqual([]);
  });

  it("navigates to /plan when the profile is saved", async () => {
    const user = userEvent.setup();
    renderButton();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(push).toHaveBeenCalledWith("/plan");
  });

  it("stays on the page when the dialog is closed without saving", async () => {
    const user = userEvent.setup();
    renderButton();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /close profile dialog/i }));

    expect(push).not.toHaveBeenCalled();
  });
});
