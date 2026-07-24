import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GeoJSON } from "geojson";

import {
  ScoutApiError,
  fetchCategories,
  fetchCorridorFeatures,
  fetchHealth,
  fetchRoute,
  reverseGeocode,
  searchGeocode,
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
            meta: { truncated: false, time_taken_ms: 12, feature_count_total: 0 },
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

describe("fetchRoute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses FeatureCollection LineString and summary props", async () => {
    // MOCK: POST /api/route happy path shape (M1-F04).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [-77.04, 38.89],
                    [-77.03, 38.9],
                  ],
                },
                properties: {
                  distance_meters: 850.25,
                  duration_seconds: 600,
                  fallback_profile_used: false,
                  warnings: ["narrow sidewalk"],
                },
              },
            ],
          }) satisfies Record<string, unknown>,
      } satisfies Partial<Response>),
    );

    const result = await fetchRoute({
      from: [-77.05, 38.91],
      to: [-77.04, 38.92],
    });

    expect(result.summary.distanceMeters).toBeCloseTo(850.25);
    expect(result.summary.durationSeconds).toBe(600);
    expect(result.summary.fallbackProfileUsed).toBe(false);
    expect(result.summary.warnings).toStrictEqual(["narrow sidewalk"]);
    expect(result.line.geometry.type).toBe("LineString");
    expect(result.response.type).toBe("FeatureCollection");
  });

  it("posts from, to, and default profile wheelchair", async () => {
    // MOCK: request body envelope.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [-1, -1],
                [-2, -2],
              ],
            },
            properties: {
              distance_meters: 1,
              duration_seconds: 1,
              fallback_profile_used: false,
              warnings: [],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchRoute({
      from: [-77.0, 38.9],
      to: [-77.01, 38.91],
    });

    const [, opts] = fetchSpy.mock.calls[0] as unknown as [
      unknown,
      { method?: string; body?: string },
    ];

    expect(String(opts.method)).toBe("POST");
    expect(JSON.parse(String(opts.body))).toStrictEqual({
      from: [-77.0, 38.9],
      to: [-77.01, 38.91],
      profile: "wheelchair",
    });
  });

  it("throws ScoutApiError on 4xx with backend envelope", async () => {
    // MOCK: error branch for route unavailable.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "ROUTE_NOT_FOUND",
            message: "We couldn't find a route between those two points.",
          },
        }),
      } satisfies Partial<Response>),
    );

    await expect(
      fetchRoute({ from: [-77.0, 38.9], to: [-77.01, 38.91] }),
    ).rejects.toMatchObject({
      message: "We couldn't find a route between those two points.",
      code: "ROUTE_NOT_FOUND",
    });
  });

  it("throws when summary properties are malformed", async () => {
    // MOCK: FeatureCollection passes but numeric summary fields missing.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [-1, -1],
                    [-2, -2],
                  ],
                },
                properties: { bogus: true },
              },
            ],
          }) satisfies Record<string, unknown>,
      } satisfies Partial<Response>),
    );

    await expect(
      fetchRoute({ from: [-77.0, 38.9], to: [-77.01, 38.91] }),
    ).rejects.toThrow(ScoutApiError);
  });
});

describe("searchGeocode", () => {
  beforeEach(() => {
    // MOCK: backend /api/geocode/search wire shape (DEC-022).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hits: [
            { id: "h1", label: "1400 U St NW", lon: -77.0366, lat: 38.9169 },
            { id: "h2", label: "Dupont Circle", lon: -77.0369, lat: 38.9097 },
          ],
        }),
      } satisfies Partial<Response>),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the backend payload into AddressHits", async () => {
    const hits = await searchGeocode("dupont", { limit: 5 });

    expect(hits).toStrictEqual([
      { id: "h1", label: "1400 U St NW", lon: -77.0366, lat: 38.9169 },
      { id: "h2", label: "Dupont Circle", lon: -77.0369, lat: 38.9097 },
    ]);
  });

  it("encodes q and limit into the backend query string", async () => {
    await searchGeocode("dupont", { limit: 7 });

    const calledUrl = String(vi.mocked(fetch).mock.calls.at(0)?.at(0) ?? "");

    expect(calledUrl).toContain("/api/geocode/search");
    expect(calledUrl).toContain("q=dupont");
    expect(calledUrl).toContain("limit=7");
  });

  it("drops malformed hit rows quietly", async () => {
    // MOCK: hits with wrong field types should be filtered, not throw.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hits: [
          { id: 123, label: "bad-id-type", lon: -1, lat: -1 },
          { id: "h-good", label: "ok", lon: -77.0, lat: 38.9 },
        ],
      }),
    } satisfies Partial<Response>);

    const hits = await searchGeocode("anything", {});

    expect(hits).toStrictEqual([{ id: "h-good", label: "ok", lon: -77.0, lat: 38.9 }]);
  });

  it("throws ScoutApiError when the backend responds non-2xx", async () => {
    // MOCK: backend error envelope surfaces typed ScoutApiError.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: "UPSTREAM_UNAVAILABLE", message: "down" },
      }),
    } satisfies Partial<Response>);

    await expect(searchGeocode("anything", {})).rejects.toBeInstanceOf(ScoutApiError);
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => {
    // MOCK: backend /api/geocode/reverse wire shape (DEC-022).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hit: { id: "r1", label: "Mapped place", lon: -77.05, lat: 38.91 },
        }),
      } satisfies Partial<Response>),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed hit", async () => {
    const hit = await reverseGeocode(-77.05, 38.91);

    expect(hit).toStrictEqual({
      id: "r1",
      label: "Mapped place",
      lon: -77.05,
      lat: 38.91,
    });
  });

  it("encodes lon/lat into the reverse query string", async () => {
    await reverseGeocode(-77.05, 38.91);

    const calledUrl = String(vi.mocked(fetch).mock.calls.at(0)?.at(0) ?? "");

    expect(calledUrl).toContain("/api/geocode/reverse");
    expect(calledUrl).toContain("lon=-77.05");
    expect(calledUrl).toContain("lat=38.91");
  });

  it("throws ScoutApiError when the backend payload lacks `hit`", async () => {
    // MOCK: malformed payload should surface as a typed error.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrong_field: 1 }),
    } satisfies Partial<Response>);

    await expect(reverseGeocode(-77, 38)).rejects.toThrow(ScoutApiError);
  });
});
