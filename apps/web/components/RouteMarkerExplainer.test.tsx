import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RouteMarkerExplainer from "./RouteMarkerExplainer";

import { EXPLAINER_KEY } from "@/lib/explainer-storage";
import { en } from "@/lib/i18n/messages";

// MOCK: localStorage — RouteMarkerExplainer reads/writes it to persist the
// dismissed state across sessions. We reset the store between each test so
// test order is irrelevant (pytest-randomly parity).
let localStorageStore: Record<string, string> = {};

beforeEach(() => {
  localStorageStore = {};

  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete localStorageStore[key];
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RouteMarkerExplainer", () => {
  it("renders on first visit (localStorage key absent)", () => {
    render(<RouteMarkerExplainer />);
    expect(screen.getByTestId("route-marker-explainer")).toBeInTheDocument();
    expect(screen.getByText(en.markerDensityExplainerCopy)).toBeInTheDocument();
  });

  it("does not render when the dismissal flag is already set", () => {
    localStorageStore[EXPLAINER_KEY] = "true";
    render(<RouteMarkerExplainer />);
    expect(screen.queryByTestId("route-marker-explainer")).not.toBeInTheDocument();
  });

  it("hides on dismiss and persists the flag to localStorage", async () => {
    render(<RouteMarkerExplainer />);

    const dismissBtn = screen.getByRole("button", {
      name: en.markerDensityExplainerDismiss,
    });
    await userEvent.click(dismissBtn);

    expect(screen.queryByTestId("route-marker-explainer")).not.toBeInTheDocument();
    expect(localStorageStore[EXPLAINER_KEY]).toBe("true");
  });

  it("stays hidden across a remount after dismissal", async () => {
    const { unmount } = render(<RouteMarkerExplainer />);
    await userEvent.click(
      screen.getByRole("button", { name: en.markerDensityExplainerDismiss }),
    );
    unmount();

    // Second mount: localStorage already has the key set.
    render(<RouteMarkerExplainer />);
    expect(screen.queryByTestId("route-marker-explainer")).not.toBeInTheDocument();
  });

  it("exposes an accessible dismiss button (≥ 44 × 44 px via CSS classes)", () => {
    render(<RouteMarkerExplainer />);
    const btn = screen.getByRole("button", {
      name: en.markerDensityExplainerDismiss,
    });
    // The h-11 w-11 Tailwind classes set 44px; verify the aria-label is correct.
    expect(btn).toHaveAttribute("aria-label", en.markerDensityExplainerDismiss);
    expect(btn).toHaveClass("h-11", "w-11");
  });

  it("passes axe with no violations when visible", async () => {
    const { container } = render(<RouteMarkerExplainer />);
    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
