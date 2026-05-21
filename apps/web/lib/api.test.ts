import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GeoJSON } from "geojson";

import {
  ScoutApiError,
  fetchCategories,
  fetchCorridorFeatures,
  fetchHealth,
  reverseGeocodeNominatim,
} from "./api";

describe("fetchHealth", () => {
  beforeEach(() => {
    // MOCK: isolate HTTP boundary for deterministic assertions.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () =>
          ({
            status: "ok",
            db: "up",
            features: 3,
            checked_at: "2024-05-05T01:02:03Z",
          }) satisfies Record<string, unknown>,
      } satisfies Partial<Response>),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses upstream health payload shape", async () => {
    const payload = await fetchHealth();

    expect(payload).toStrictEqual({
      status: "ok",
      db: "up",
      features: 3,
      checked_at: "2024-05-05T01:02:03Z",
    });
    expect(fetch).toHaveBeenCalledWith("/api/health", {
      signal: undefined,
      cache: "no-store",
    });
  });

  it("throws ScoutApiError when upstream rejects", async () => {
    // MOCK: error branch verifies JSON `{error:{code,message}}` wrapping.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "HEALTH_ERR", message: "health failed" } }),
    } satisfies Partial<Response>);

    try {
      await fetchHealth();
      expect.fail();
    } catch (error) {
      expect(error).toBeInstanceOf(ScoutApiError);
      expect((error as ScoutApiError).code).toBe("HEALTH_ERR");
      expect((error as ScoutApiError).message).toBe("health failed");
    }
  });
});

describe("fetchCategories", () => {
  beforeEach(() => {
    // MOCK: categories GET without calling FastAPI directly.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          categories: [
            {
              id: "curb_ramps",
              label: "Curb ramps",
              description: "Desc",
              kind: "aid",
              default_enabled: true,
            },
          ],
        }),
      } satisfies Partial<Response>),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns normalized categories payload", async () => {
    await expect(fetchCategories()).resolves.toMatchObject([
      { id: "curb_ramps", kind: "aid" },
    ]);
  });

  it("throws when categories collection is malformed", async () => {
    // MOCK: API contract violation should surface as ScoutApiError.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ categories: {} }),
    } satisfies Partial<Response>);

    await expect(fetchCategories()).rejects.toThrow(ScoutApiError);
  });
});

describe("fetchCorridorFeatures", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          ({
            type: "FeatureCollection",
            features: [],
            meta: { truncated: false, time_taken_ms: 12 },
          }) satisfies Record<string, unknown>,
      } satisfies Partial<Response>),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires FeatureCollection payloads", async () => {
    // MOCK: happy path verifies POST shape mapping.
    const routeGeometry: GeoJSON.LineString = {
      type: "LineString",
      coordinates: [
        [-77.04, 38.89],
        [-77.03, 38.9],
      ],
    };

    const response = await fetchCorridorFeatures({
      route_geometry: routeGeometry,
      categories: ["curb_ramps"],
    });

    expect(response.type).toBe("FeatureCollection");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ malformed: true }),
    });

    await expect(
      fetchCorridorFeatures({
        route_geometry: routeGeometry,
        categories: ["curb_ramps"],
      }),
    ).rejects.toThrow(/malformed/i);
  });
});

describe("reverseGeocodeNominatim", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_NOMINATIM_URL", "https://demo.example.invalid");
    // MOCK: Nominatim JSON array parsing with mixed attribute keys.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          [{ lon: "-1", lat: "-2", label: "a" }] satisfies Record<
            string,
            unknown
          >[],
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("maps lon/lng variants into GeoJSON Points", async () => {
    const pts = await reverseGeocodeNominatim("test");

    expect(pts.at(0)).toStrictEqual({ type: "Point", coordinates: [-1, -2] });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("drops nominatim rows that omit coordinates", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lon: Number.NaN, lat: Number.NaN }],
    });

    await expect(reverseGeocodeNominatim("missing coords")).resolves.toStrictEqual([]);
  });
});

describe("reverseGeocodeNominatim stub fallback", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_NOMINATIM_URL", "https://offline.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SCOUT_STUB_GEOCODE", "1");
    // MOCK: forces geocode egress failure so scaffold can fall back deterministically.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network fail")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns deterministic suggestions while stub geocode toggle is enabled", async () => {
    await expect(reverseGeocodeNominatim("any")).resolves.toStrictEqual([
      { type: "Point", coordinates: [-77.0366, 38.8949] },
      { type: "Point", coordinates: [-77.025, 38.905] },
    ]);
  });
});