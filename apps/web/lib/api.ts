import type { GeoJSON } from "geojson";

/** Browser dev normally points at the host-published FastAPI port (`NEXT_PUBLIC_SCOUT_API_BASE_URL` in `infra/docker-compose.yml`; unset for same-origin `/api/*`). Same-origin builds pair with `infra/docker-compose.mobile.yml` + `SCOUT_BACKEND_INTERNAL_URL` so `apps/web/next.config.ts` rewrites `/api/*` → `http://backend:8080/api/*`. Server Components may use relative `/api`. */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_SCOUT_API_BASE_URL ?? "";
}

export class ScoutApiError extends Error {
  readonly code?: string | undefined;

  constructor(message: string, code?: string | undefined, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "ScoutApiError";
  }
}

async function safeReadJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function coordinateFromUnknown(value: unknown): number | null {
  const asNumber =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(asNumber) ? asNumber : null;
}

function parseUpstreamError(payload: unknown): ScoutApiError {
  const err =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "object" &&
    (payload as { error: { message?: unknown; code?: unknown } }).error !== null
      ? (
          payload as {
            error?: { message?: unknown; code?: unknown };
          }
        ).error
      : undefined;

  const msg = typeof err?.message === "string" ? err.message : "Scout upstream error.";
  const code = typeof err?.code === "string" ? err.code : undefined;

  return new ScoutApiError(msg, code);
}

export type DbStatus = "up" | "down";

export interface HealthPayload {
  status: "ok";
  db: DbStatus;
  features: number | null;
  checked_at: string;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthPayload> {
  const resp = await fetch(`${apiBase()}/api/health`, { signal, cache: "no-store" });

  const body = await safeReadJson(resp);
  if (!resp.ok || typeof body !== "object") {
    throw parseUpstreamError(body);
  }

  const payload = body as Record<string, unknown>;
  const dbRaw = payload["db"];

  const dbOk = dbRaw === "up";

  return {
    status: payload["status"] === "ok" ? "ok" : "ok",
    db: dbOk ? "up" : "down",
    features: typeof payload["features"] === "number" ? payload["features"] : null,
    checked_at: typeof payload["checked_at"] === "string" ? payload["checked_at"] : "",
  };
}

export type CategoryKind = "obstacle" | "aid";

export interface ApiCategory {
  id: string;
  label: string;
  description: string;
  kind: CategoryKind;
  default_enabled: boolean;
}

export async function fetchCategories(signal?: AbortSignal): Promise<ApiCategory[]> {
  const resp = await fetch(`${apiBase()}/api/categories`, {
    signal,
    cache: "no-store",
  });
  const body = await safeReadJson(resp);
  if (!resp.ok || typeof body !== "object" || body === null) {
    throw parseUpstreamError(body);
  }

  const categoriesUnknown = (body as { categories?: unknown }).categories;
  if (!Array.isArray(categoriesUnknown)) {
    throw new ScoutApiError("Categories payload malformed.");
  }

  const categories = categoriesUnknown.reduce<ApiCategory[]>((acc, raw) => {
    if (
      typeof raw === "object" &&
      raw !== null &&
      typeof (raw as { id?: unknown }).id === "string" &&
      typeof (raw as { label?: unknown }).label === "string" &&
      typeof (raw as { description?: unknown }).description === "string" &&
      ((raw as { kind?: unknown }).kind === "obstacle" ||
        (raw as { kind?: unknown }).kind === "aid") &&
      typeof (raw as { default_enabled?: unknown }).default_enabled === "boolean"
    ) {
      acc.push(raw as ApiCategory);
    }

    return acc;
  }, []);

  return categories;
}

export interface CorridorResponse {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
  meta: { truncated: boolean; time_taken_ms: number };
}

export async function fetchCorridorFeatures(
  payload: {
    route_geometry: GeoJSON.LineString;
    buffer_meters?: number | undefined;
    categories: readonly string[];
  },
  signal?: AbortSignal,
): Promise<CorridorResponse> {
  const resp = await fetch(`${apiBase()}/api/route-features`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route_geometry: payload.route_geometry,
      buffer_meters: payload.buffer_meters ?? 30,
      categories: [...payload.categories],
    }),
    cache: "no-store",
    signal,
  });

  const body = await safeReadJson(resp);
  if (!resp.ok) {
    throw parseUpstreamError(body);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    (body as CorridorResponse).type !== "FeatureCollection"
  ) {
    throw new ScoutApiError("Corridor payload malformed.");
  }

  const featuresUnknown = (body as CorridorResponse).features;
  if (!Array.isArray(featuresUnknown)) {
    throw new ScoutApiError("Corridor features missing.");
  }

  const metaUnknown = (body as CorridorResponse).meta;
  if (
    typeof metaUnknown !== "object" ||
    metaUnknown === null ||
    typeof metaUnknown.truncated !== "boolean" ||
    typeof metaUnknown.time_taken_ms !== "number"
  ) {
    throw new ScoutApiError("Corridor metadata malformed.");
  }

  return body as CorridorResponse;
}

export async function reverseGeocodeNominatim(
  query: string,
  signal?: AbortSignal,
): Promise<GeoJSON.Point[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
  });

  const url = `/search?${params.toString()}`;

  /**
   * M1 scaffold calls OSM nominatim directly with debounced UX in the widget.
   * Browsers block cross-origin reads without CORS headers; deployments should swap in `/api/geocode`.
   */

  const nominatimBase =
    process.env.NEXT_PUBLIC_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";

  try {
    const resp = await fetch(`${nominatimBase}${url}`, {
      signal,
      headers: {
        "Accept-Language": "en-US",
      },
    });

    if (!resp.ok) {
      throw new ScoutApiError("Geocode lookup failed.", "GEOCODE_FAILED");
    }

    const body = await safeReadJson(resp);
    if (!Array.isArray(body)) {
      return [];
    }

    return body.reduce<GeoJSON.Point[]>((acc, candidate) => {
      if (typeof candidate !== "object" || candidate === null) {
        return acc;
      }

      const rec = candidate as Record<string, unknown>;
      const lon = coordinateFromUnknown(rec.lon ?? rec.lng ?? rec.longitude ?? rec.Lng);
      const lat = coordinateFromUnknown(rec.lat ?? rec.latitude ?? rec.Lat);

      if (lon === null || lat === null) {
        return acc;
      }

      acc.push({ type: "Point", coordinates: [lon, lat] });

      return acc;
    }, []);
  } catch (error) {
    if (process.env.NEXT_PUBLIC_SCOUT_STUB_GEOCODE === "1") {
      // MOCK: deterministic suggestions for deterministic Playwright without live geocode egress.
      return [
        { type: "Point", coordinates: [-77.0366, 38.8949] },
        { type: "Point", coordinates: [-77.025, 38.905] },
      ];
    }

    throw error instanceof Error ? error : new ScoutApiError("Geocoder error.");
  }
}
