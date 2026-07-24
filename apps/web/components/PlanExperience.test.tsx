import type { ApiCategory, CorridorResponse, RouteComputeResult } from "@/lib/api";
import * as scoutApi from "@/lib/api";
import type { GeoJSON } from "geojson";

import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import userEvent, { type UserEvent } from "@testing-library/user-event";

import { render, screen, waitFor, within } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import PlanExperience from "./PlanExperience";

import { demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";
import { en } from "@/lib/i18n/messages";
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

      if (url.includes("/map-markers/") && url.endsWith(".svg")) {
        return {
          ok: true,
          text: async () =>
            '<svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor"/></svg>',
        } satisfies Partial<Response>;
      }

      throw new Error(`Unhandled fetch(${url})`);
    }),
  );
}

const PLAN_SAMPLE: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "Sidewalk transitions.",
    kind: "obstacle",
    default_enabled: true,
  },
];

const ROUTE_LINE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [-77.0415, 38.895],
      [-77.0312, 38.9074],
      [-77.0122, 38.9175],
    ],
  },
  properties: {},
};

const ROUTE_OK_PAYLOAD: RouteComputeResult = {
  line: ROUTE_LINE,
  summary: {
    distanceMeters: 930,
    durationSeconds: 720,
    fallbackProfileUsed: false,
    warnings: ["narrow crossing ahead"],
  },
  response: { type: "FeatureCollection", features: [ROUTE_LINE] },
};

describe("PlanExperience", () => {
  let corridorSpy: ReturnType<typeof vi.spyOn>;
  let routeSpy: ReturnType<typeof vi.spyOn>;

  /** Reuses keyboard affordances exercised in Playwright `/plan`; drives stub geocoder hits only. */
  async function keyboardPickBothAddresses(user: UserEvent): Promise<void> {
    await screen.findByRole("heading", { name: /^plan a route$/i });

    const plannerRegion = screen.getByRole("group", { name: /plan a route/i });
    const planner = within(plannerRegion);

    const start = planner.getByRole("combobox", { name: /starting point/i });

    await user.type(start, "1400");

    await waitFor(
      () =>
        expect((start as HTMLInputElement).value.trim().length).toBeGreaterThanOrEqual(
          4,
        ),
      { timeout: 20_000 },
    );

    // DEBOUNCE_MS=500 in AddressAutocomplete; stub returns exactly one hit for "1400".
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/1 suggestion/i),
    );

    const suggestionButtons = within(plannerRegion).getAllByRole("button", {
      name: /show suggestions/i,
    });

    await user.click(suggestionButtons[0]!);

    await user.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /1400 U Street/i })).toBeVisible(),
    );

    await user.keyboard("{Enter}");

    await waitFor(
      () =>
        expect(
          (start as HTMLInputElement).value.toLowerCase().includes("1400 u street"),
        ).toBe(true),
      { timeout: 20_000 },
    );

    const destination = planner.getByRole("combobox", { name: /destination/i });

    await user.click(destination);

    await user.clear(destination);

    await user.type(destination, "Dupont");

    await waitFor(
      () =>
        expect(
          (destination as HTMLInputElement).value.trim().length,
        ).toBeGreaterThanOrEqual(6),
      { timeout: 20_000 },
    );

    // Stub expands to both fixture hits for "Dupont"-style queries — expect two rows.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/2 suggestion/i),
    );

    const suggestionButtonsAfter = within(plannerRegion).getAllByRole("button", {
      name: /show suggestions/i,
    });

    await user.click(suggestionButtonsAfter[1]!);

    await user.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Dupont Circle/i })).toBeVisible(),
    );

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    await waitFor(
      () =>
        expect(
          (destination as HTMLInputElement).value
            .toLowerCase()
            .includes("dupont circle"),
        ).toBe(true),
      { timeout: 20_000 },
    );
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SCOUT_MAP_MODE", "stub");
    vi.stubEnv("NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER", "stub");
    void stubCategoriesPayload(PLAN_SAMPLE);

    const corridorPayload: CorridorResponse = {
      type: "FeatureCollection",
      features: demoCorridorFeatures(),
      meta: {
        truncated: false,
        time_taken_ms: 8,
        feature_count_total: demoCorridorFeatures().length,
      },
    };

    corridorSpy = vi
      .spyOn(scoutApi, "fetchCorridorFeatures")
      .mockResolvedValue(corridorPayload);

    routeSpy = vi.spyOn(scoutApi, "fetchRoute").mockResolvedValue(ROUTE_OK_PAYLOAD);

    window.localStorage.clear();
  });

  afterEach(() => {
    corridorSpy.mockRestore();
    routeSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("shows start and destination combobox controls in landmark order", async () => {
    const { container } = render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await screen.findByRole("heading", { name: /^plan a route$/i });

    const plannerRegion = screen.getByRole("group", { name: /plan a route/i });
    const planner = within(plannerRegion);

    const start = planner.getByRole("combobox", { name: /starting point/i });
    const destination = planner.getByRole("combobox", { name: /destination/i });

    expect(
      start.compareDocumentPosition(destination) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

    const results = await axe(container);

    expect(results.violations).toStrictEqual([]);
  });

  it("announces 'Map shown.' and keeps focus on the toggle when revealed on mobile", async () => {
    // matchMedia defaults to matches:false in the test setup, i.e. < 768px.
    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await screen.findByRole("heading", { name: /^plan a route$/i });
    await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

    const toggle = screen.getByRole("button", { name: /^show map$/i });
    await user.click(toggle);

    expect(await screen.findByText("Map shown.")).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("pulls corridor slices once profile categories are ready", async () => {
    const { baseElement } = render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await screen.findByRole("heading", { name: /^plan a route$/i });

    await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

    const results = await axe(baseElement);

    expect(results.violations).toStrictEqual([]);
  });

  it("renders routed distance, duration, and warnings once both endpoints are chosen", async () => {
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await keyboardPickBothAddresses(user);

    await waitFor(() => expect(routeSpy).toHaveBeenCalled());

    expect(await screen.findByText("930 meters")).toBeVisible();

    expect(screen.getByText("12 minutes")).toBeVisible();

    expect(screen.getByText(/narrow crossing ahead/i)).toBeVisible();

    const results = await axe(container);

    expect(results.violations).toStrictEqual([]);
  }, 60_000);

  describe("route retrieval errors", () => {
    beforeEach(() => {
      routeSpy.mockRejectedValue(
        new scoutApi.ScoutApiError("We couldn't compute a walking route."),
      );
    });

    it("warns that directions are unavailable but still loads corridor features", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <AnnounceProvider>
          <ProfileProvider>
            <PlanExperience />
          </ProfileProvider>
        </AnnounceProvider>,
      );

      await keyboardPickBothAddresses(user);

      await waitFor(() => expect(routeSpy).toHaveBeenCalled());

      expect(await screen.findByText(/directions unavailable/i)).toBeVisible();

      // The map + features pipeline still runs even though routing failed.
      await waitFor(() => expect(corridorSpy).toHaveBeenCalled());
    }, 60_000);
  });

  describe("corridor retrieval errors", () => {
    beforeEach(() => {
      corridorSpy.mockRejectedValue(new Error("corridor unavailable"));
    });

    it("announces a sample fallback when the corridor request fails", async () => {
      render(
        <AnnounceProvider>
          <ProfileProvider>
            <PlanExperience />
          </ProfileProvider>
        </AnnounceProvider>,
      );

      await screen.findByRole("heading", { name: /^plan a route$/i });

      await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

      await waitFor(() => {
        const politeAnnouncers = screen
          .getAllByRole("status")
          .filter((element) => element.classList.contains("sr-only"));

        expect(
          politeAnnouncers.some((region) =>
            region.textContent?.includes("Couldn't refresh corridor items."),
          ),
        ).toBe(true);
      });

      // A failed corridor fetch is now a distinct error state, not the
      // "nothing matched" empty state.
      expect(
        screen.queryByText(en.alongRouteEmptyState, { exact: false }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByText(en.corridorListingErrorTitle).length).toBeGreaterThan(
        0,
      );
    });
  });
});
