import type { ApiCategory, CorridorResponse } from "@/lib/api";
import * as scoutApi from "@/lib/api";

import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import PlanExperience from "./PlanExperience";

import { demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";
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

const PLAN_SAMPLE: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "Sidewalk transitions.",
    kind: "aid",
    default_enabled: true,
  },
];

describe("PlanExperience", () => {
  let corridorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SCOUT_MAP_MODE", "stub");
    void stubCategoriesPayload(PLAN_SAMPLE);

    const corridorPayload: CorridorResponse = {
      type: "FeatureCollection",
      features: demoCorridorFeatures(),
      meta: { truncated: false, time_taken_ms: 8 },
    };

    corridorSpy = vi
      .spyOn(scoutApi, "fetchCorridorFeatures")
      .mockResolvedValue(corridorPayload);

    window.localStorage.clear();
  });

  afterEach(() => {
    corridorSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("pulls corridor slices once profile categories are ready", async () => {
    const { baseElement } = render(
      <AnnounceProvider>
        <ProfileProvider>
          <PlanExperience />
        </ProfileProvider>
      </AnnounceProvider>,
    );

    await screen.findByRole("heading", { name: /^plan a walking route$/i });

    await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

    const results = await axe(baseElement);

    expect(results.violations).toStrictEqual([]);
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

      await screen.findByRole("heading", { name: /^plan a walking route$/i });

      await waitFor(() => expect(corridorSpy).toHaveBeenCalled());

      await screen.findByText(/showing a sample instead/i);
    });
  });
});
