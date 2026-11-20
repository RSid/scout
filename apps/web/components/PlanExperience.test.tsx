import type { ApiCategory, CorridorResponse, RouteComputeResult } from "@/lib/api";
import * as scoutApi from "@/lib/api";
import type { GeoJSON } from "geojson";

import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import userEvent, { type UserEvent } from "@testing-library/user-event";

import { render, screen, waitFor, within } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import PlanExperience from "./PlanExperience";

import {
  UNVERIFIED_END_SEGMENT,
  demoCorridorFeatures,
} from "@/lib/fixtures/route-plan-fixtures";
import { corridorItemsAnnouncement, en } from "@/lib/i18n/messages";
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
    warnings: [],
    unverifiedSegments: [UNVERIFIED_END_SEGMENT],
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

    // The planner pre-fills the sample route's address; clear it like a user would.
    await user.clear(start);
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

    await keyboardPickDestination(user);
  }

  /** Replaces the pre-filled destination with the stub geocoder's Dupont Circle hit. */
  async function keyboardPickDestination(user: UserEvent): Promise<void> {
    const plannerRegion = screen.getByRole("group", { name: /plan a route/i });
    const destination = within(plannerRegion).getByRole("combobox", {
      name: /destination/i,
    });

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

  it.each([
    [/starting point/i, "1000 MADISON DRIVE NW"],
    [/destination/i, "1201 G STREET NW"],
  ])("pre-fills %s with the sample route's address", async (name, address) => {
    render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    expect(await screen.findByRole("combobox", { name })).toHaveValue(address);
  });

  it("shows the frozen sample route without calling the routing API on load", async () => {
    render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

    expect(routeSpy).not.toHaveBeenCalled();
  });

  it("routes from the sample start when only the destination changes", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );
    await screen.findByRole("heading", { name: /^plan a route$/i });

    await keyboardPickDestination(user);

    await waitFor(() =>
      expect(routeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ from: [-77.02624344, 38.89020747] }),
        expect.anything(),
      ),
    );
  });

  it("places the route summary after the start and destination inputs", async () => {
    render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    const destination = await screen.findByRole("combobox", { name: /destination/i });
    const summary = screen.getByRole("region", { name: /^route summary$/i });

    expect(
      destination.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    // Wait for the corridor announcement itself, not just the fetch call: the
    // live region holds one message, so a late corridor announce would replace
    // "Map shown." after the click.
    await screen.findByText(corridorItemsAnnouncement(demoCorridorFeatures().length));

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

  it("renders routed distance, duration, and route notices once both endpoints are chosen", async () => {
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

    // Raw warning codes are no longer rendered (M1-F05); the plain-language
    // unverified-stretch line is the notice this flow now shows.
    // RTL's default normalizer folds the non-breaking space to a plain one.
    expect(screen.getByText(/the last 135 m to this spot/i)).toBeVisible();

    const results = await axe(container);

    expect(results.violations).toStrictEqual([]);
  }, 60_000);

  describe("route-features request dedupe (M1-F07)", () => {
    function renderPlanner(): void {
      render(
        <AnnounceProvider>
          <ProfileProvider>
            <PlanExperience />
          </ProfileProvider>
        </AnnounceProvider>,
      );
    }

    /** Lets any late, duplicate request show up before counting. */
    function settle(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 100));
    }

    it("sends one route-features request on page load", async () => {
      renderPlanner();

      await screen.findByText(corridorItemsAnnouncement(demoCorridorFeatures().length));
      await settle();

      expect(corridorSpy).toHaveBeenCalledTimes(1);
    });

    it("waits for the profile's categories before the first request", async () => {
      renderPlanner();

      await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

      expect(corridorSpy.mock.calls[0]?.[0]).toMatchObject({
        categories: ["curb_ramps"],
      });
    });

    it("does not query a straight-line corridor while the route is in flight", async () => {
      // MOCK: routing never settles, holding the planner in its pending state.
      routeSpy.mockReturnValue(new Promise<RouteComputeResult>(() => undefined));
      const user = userEvent.setup({ delay: null });
      renderPlanner();
      await waitFor(() => expect(corridorSpy).toHaveBeenCalledTimes(1));

      await keyboardPickDestination(user);
      await waitFor(() => expect(routeSpy).toHaveBeenCalled());
      await settle();

      expect(corridorSpy).toHaveBeenCalledTimes(1);
    }, 60_000);

    it.each([
      ["the route arrives", "ok", ROUTE_LINE.geometry.coordinates.length, 30],
      ["routing fails", "error", 2, 200],
    ] as const)(
      "sends one route-features request once %s",
      async (_name, outcome, pointCount, bufferMeters) => {
        if (outcome === "error") {
          // MOCK: routing failure drives the straight-line fallback corridor.
          routeSpy.mockRejectedValue(new scoutApi.ScoutApiError("No route."));
        }
        const user = userEvent.setup({ delay: null });
        renderPlanner();
        await waitFor(() => expect(corridorSpy).toHaveBeenCalledTimes(1));

        await keyboardPickDestination(user);
        await waitFor(() => expect(corridorSpy).toHaveBeenCalledTimes(2));
        await settle();

        const routedCalls = corridorSpy.mock.calls.slice(1).map(([request]) => ({
          points: (request as { route_geometry: GeoJSON.LineString }).route_geometry
            .coordinates.length,
          buffer: (request as { buffer_meters: number }).buffer_meters,
        }));
        expect(routedCalls).toStrictEqual([
          { points: pointCount, buffer: bufferMeters },
        ]);
      },
      60_000,
    );
  });

  describe("busy and rate-limited routing (M1-F04)", () => {
    function busyError(
      code: string,
      retryAfterSeconds: number,
    ): scoutApi.ScoutApiError {
      return new scoutApi.ScoutApiError("Busy.", code, {
        status: code === "RATE_LIMIT" ? 429 : 503,
        retryAfterSeconds,
      });
    }

    async function planToDupont(): Promise<HTMLElement> {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <AnnounceProvider>
          <ProfileProvider>
            <PlanExperience />
          </ProfileProvider>
        </AnnounceProvider>,
      );
      await screen.findByRole("heading", { name: /^plan a route$/i });
      await keyboardPickDestination(user);
      return container;
    }

    it.each([
      [
        "ROUTE_SERVICE_BUSY",
        "Route planning is busy",
        60,
        /try again in about a minute/i,
      ],
      ["RATE_LIMIT", "Too many route requests", 20, /try again in a few seconds/i],
    ])(
      "shows a specific %s message with when to retry",
      async (code, title, retryAfterSeconds, detail) => {
        // MOCK: backend refuses routing with a Retry-After.
        routeSpy.mockRejectedValue(busyError(code, retryAfterSeconds));

        await planToDupont();

        const strip = (await screen.findByText(title)).parentElement;
        expect(strip).toHaveTextContent(detail);
      },
      60_000,
    );

    it("passes axe while routing is busy", async () => {
      // MOCK: backend refuses routing with a Retry-After.
      routeSpy.mockRejectedValue(busyError("ROUTE_SERVICE_BUSY", 3600));

      const container = await planToDupont();
      await screen.findByText("Route planning is busy");

      expect((await axe(container)).violations).toStrictEqual([]);
    }, 60_000);

    it("doesn't ask for another route until Retry-After passes", async () => {
      // MOCK: backend refuses routing with a long Retry-After.
      routeSpy.mockRejectedValue(busyError("ROUTE_SERVICE_BUSY", 3600));
      const user = userEvent.setup({ delay: null });
      render(
        <AnnounceProvider>
          <ProfileProvider>
            <PlanExperience />
          </ProfileProvider>
        </AnnounceProvider>,
      );
      await screen.findByRole("heading", { name: /^plan a route$/i });

      await keyboardPickDestination(user);
      await screen.findByText("Route planning is busy");
      // A second pick (start → Dupont) would normally request a new route.
      await keyboardPickBothAddresses(user);
      await screen.findByText("Route planning is busy");

      expect(routeSpy).toHaveBeenCalledTimes(1);
    }, 60_000);
  });

  describe("busy and rate-limited corridor queries (M1-F07)", () => {
    it.each([
      ["CORRIDOR_QUERY_TIMEOUT", 503, en.corridorListingErrorTitle, /took too long/i],
      ["RATE_LIMIT", 429, en.corridorListingErrorTitle, /try again in about a minute/i],
    ])(
      "explains a %s failure in the status strip",
      async (code, status, title, detail) => {
        // MOCK: backend refuses the corridor query.
        corridorSpy.mockRejectedValue(
          new scoutApi.ScoutApiError("Busy.", code, { status, retryAfterSeconds: 60 }),
        );
        const { container } = render(
          <AnnounceProvider>
            <ProfileProvider>
              <PlanExperience />
            </ProfileProvider>
          </AnnounceProvider>,
        );

        const strip = (await screen.findAllByText(title))
          .map((element) => element.parentElement)
          .find((parent) => parent !== null && detail.test(parent.textContent ?? ""));
        expect(strip).toBeDefined();
        expect((await axe(container)).violations).toStrictEqual([]);
      },
    );
  });

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

    it("does not flash an error when a corridor fetch is aborted", async () => {
      corridorSpy.mockRejectedValue(new DOMException("Aborted", "AbortError"));

      render(
        <AnnounceProvider>
          <ProfileProvider>
            <PlanExperience />
          </ProfileProvider>
        </AnnounceProvider>,
      );

      await screen.findByRole("heading", { name: /^plan a route$/i });

      await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

      // Give any erroneous state updates a chance to flush.
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.queryByText(en.corridorListingErrorTitle)).not.toBeInTheDocument();
    });
  });
});
