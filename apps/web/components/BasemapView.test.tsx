import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";

import BasemapView from "./BasemapView";

import {
  DEMO_ROUTE,
  demoCorridorFeatures,
} from "@/lib/fixtures/route-plan-fixtures";

describe("BasemapView", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SCOUT_MAP_MODE", "stub");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows placeholder UI when stub mode is enforced", async () => {
    const { container } = render(
      <BasemapView corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />,
    );

    expect(screen.getByRole("heading", { name: /Basemap scaffold/i })).toBeVisible();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
