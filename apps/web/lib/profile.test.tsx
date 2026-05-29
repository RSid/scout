import type { ReactNode } from "react";

import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiCategory } from "@/lib/api";

import { PROFILE_STORAGE_KEY, ProfileProvider, useProfile } from "./profile";

const REMOTE_CATEGORY: ApiCategory = {
  id: "elevators",
  label: "Elevators",
  description: "Vertical circulation.",
  kind: "aid",
  default_enabled: false,
};

function ProfileProbe(): ReactNode {
  const { categories, isReady } = useProfile();

  return (
    <div>
      {isReady ? null : <p>waiting</p>}
      <p aria-live="polite">{isReady ? (categories.at(0)?.label ?? "") : ""}</p>
    </div>
  );
}

describe("ProfileProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          ({
            categories: [REMOTE_CATEGORY],
          }) satisfies Record<string, unknown>,
      } satisfies Partial<Response>),
    );
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  });

  it("hydrates selections from mocked categories endpoint", async () => {
    const { container } = render(
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.getByText(REMOTE_CATEGORY.label)).toBeVisible());

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("persists optimistic toggles to localStorage snapshots", async () => {
    function PersistenceHarness(): ReactNode {
      const { toggle, selections, persist, categories, isReady } = useProfile();
      const first = categories.at(0);

      return (
        <>
          {!isReady ? <p aria-hidden>warming</p> : null}
          <button
            type="button"
            disabled={!isReady || first === undefined}
            aria-label={`Toggle ${REMOTE_CATEGORY.label}`}
            onClick={() => {
              if (!first) return;
              toggle(first.id, true);
            }}
          >
            Enable category
          </button>
          <button
            type="button"
            disabled={!isReady || first === undefined}
            onClick={() => persist()}
          >
            Save profile selections
          </button>
          <p aria-live="polite">{String(selections[REMOTE_CATEGORY.id] ?? "unset")}</p>
        </>
      );
    }

    render(
      <ProfileProvider>
        <PersistenceHarness />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.queryByText("warming")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /toggle elevators/i }));

    expect(await screen.findByText(/^true$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save profile selections/i }));

    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);

    expect(JSON.parse(raw ?? "{}")).toStrictEqual({
      version: 1,
      selections: { elevators: true },
    });
  });
});

describe("ProfileProvider offline hydrate", () => {
  beforeEach(() => {
    // MOCK: network failure path should fall back to bundled taxonomy copy.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  });

  it("surfaces SAMPLE category labels when upstream fetch fails", async () => {
    render(
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>,
    );

    await screen.findByText(/Curb ramps/i);

    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });
});

describe("ProfileProvider storage availability", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ categories: [REMOTE_CATEGORY] }),
      } satisfies Partial<Response>),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("flags storageBlocked when localStorage writes throw (private mode/quota)", async () => {
    // MOCK: simulate Safari private mode / quota by making setItem throw.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    function StorageProbe(): ReactNode {
      const { isReady, storageBlocked } = useProfile();
      return isReady ? <p>{storageBlocked ? "blocked" : "writable"}</p> : null;
    }

    render(
      <ProfileProvider>
        <StorageProbe />
      </ProfileProvider>,
    );

    expect(await screen.findByText("blocked")).toBeInTheDocument();
  });
});
