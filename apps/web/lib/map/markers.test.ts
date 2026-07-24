import maplibregl from "maplibre-gl";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { CorridorResponse } from "@/lib/api";

import {
  ROUTE_MARKER_CATEGORY_IDS,
  corridorFeatureWithMarkerSeverity,
  deriveMarkerSeverity,
  registerScoutRouteMarkerSprites,
  scoutMarkerIconId,
} from "./markers";

type CorridorFeature = CorridorResponse["features"][number];

function fakeCorridorFeature(
  overrides: Partial<Record<string, unknown>>,
): CorridorFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-77.032, 38.907] },
    properties: {
      id: "fixture-1",
      category: "curb_ramps",
      kind: "obstacle",
      condition: "Good",
      condition_normalized: "good",
      ...overrides,
    },
  } as CorridorFeature;
}

describe("deriveMarkerSeverity + scoutMarkerIconId", () => {
  it("derives obstacle severities", () => {
    expect(deriveMarkerSeverity("obstacle", "blocking")).toBe("blocking");
    expect(deriveMarkerSeverity("obstacle", "missing")).toBe("blocking");
    expect(deriveMarkerSeverity("obstacle", "difficult")).toBe("difficult");
    expect(deriveMarkerSeverity("obstacle", "fair")).toBe("mild");
  });

  it("pins aids at the aid palette key", () => {
    expect(deriveMarkerSeverity("aid", "fair")).toBe("aid");
    expect(scoutMarkerIconId("water_cooling", "aid")).toBe("water_cooling:aid");
  });
});

describe("corridorFeatureWithMarkerSeverity", () => {
  it("adds scout_severity alongside category", () => {
    const out = corridorFeatureWithMarkerSeverity(
      fakeCorridorFeature({
        category: "curb_ramps",
        kind: "obstacle",
        condition_normalized: "missing",
      }),
    );

    expect((out.properties as Record<string, unknown>)?.scout_severity).toBe(
      "blocking",
    );
  });
});

describe("registerScoutRouteMarkerSprites", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve({
          ok: true,
          text: async () =>
            '<svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor"/></svg>',
        } satisfies Partial<Response>),
      ),
    );

    class FakeImg {
      onload: (() => void) | null = null;

      onerror: (() => void) | null = null;

      width = 8;

      height = 8;

      set src(_uri: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    vi.stubGlobal("Image", FakeImg);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers raster sprites exactly once per required icon id", async () => {
    const expectedIcons = ROUTE_MARKER_CATEGORY_IDS.length * 4;

    const mockMap = {
      hasImage: (): boolean => false,
      addImage: vi.fn(),
    };

    await registerScoutRouteMarkerSprites(mockMap as unknown as maplibregl.Map, {
      basePublicUrl: "",
    });

    expect(mockMap.addImage).toHaveBeenCalledTimes(expectedIcons);
  });
});
