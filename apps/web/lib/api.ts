import type { GeoJSON } from "geojson";

import type { AddressHit } from "@/lib/providers/geocoding/protocol";

export const CORRIDOR_BUFFER_METERS = 30;
export const CORRIDOR_BUFFER_METERS_FALLBACK = 200;

/** Server-side callers use relative `/api`; browser dev points at the host-published FastAPI port (`:8080` by default, overridable via `SCOUT_BACKEND_HOST_PORT`). Name must match `infra/docker-compose.yml` `NEXT_PUBLIC_SCOUT_API_BASE_URL`. */
/** Browser dev normally points at the host-published API port (`NEXT_PUBLIC_SCOUT_API_BASE_URL` in `infra/docker-compose.yml`; unset for same-origin `/api/*`). Same-origin builds pair with `infra/docker-compose.mobile.yml` + `SCOUT_BACKEND_INTERNAL_URL` so `apps/web/next.config.ts` rewrites `/api/*` → `http://backend:8080/api/*`. Server Components may use relative `/api`. */
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
  const resp = await fetch(`${apiBase()}/api/health`, { signal });

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
  const resp = await fetch(`${apiBase()}/api/categories`, { signal });
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

function parseAddressHit(raw: unknown): AddressHit | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  if (
    typeof rec["id"] !== "string" ||
    typeof rec["label"] !== "string" ||
    typeof rec["lon"] !== "number" ||
    typeof rec["lat"] !== "number"
  ) {
    return null;
  }
  return {
    id: rec["id"],
    label: rec["label"],
    lon: rec["lon"],
    lat: rec["lat"],
  };
}

/**
 * Forward geocode via the Scout backend (`DEC-022`). The browser never calls
 * a geocoder upstream directly; this wrapper is the only path from a
 * React component to address suggestions.
 */
export async function searchGeocode(
  query: string,
  options?: { limit?: number | undefined },
  signal?: AbortSignal,
): Promise<readonly AddressHit[]> {
  const params = new URLSearchParams({ q: query.trim() });
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }

  const resp = await fetch(`${apiBase()}/api/geocode/search?${params.toString()}`, {
    signal,
    cache: "no-store",
  });

  const body = await safeReadJson(resp);
  if (!resp.ok) {
    throw parseUpstreamError(body);
  }
  if (typeof body !== "object" || body === null) {
    throw new ScoutApiError("Geocode payload malformed.", "GEOCODE_FAILED");
  }

  const hitsUnknown = (body as { hits?: unknown }).hits;
  if (!Array.isArray(hitsUnknown)) {
    throw new ScoutApiError("Geocode payload malformed.", "GEOCODE_FAILED");
  }

  return hitsUnknown.reduce<AddressHit[]>((acc, raw) => {
    const parsed = parseAddressHit(raw);
    if (parsed !== null) {
      acc.push(parsed);
    }
    return acc;
  }, []);
}

/** Reverse geocode via the Scout backend (`DEC-022`). */
export async function reverseGeocode(
  lon: number,
  lat: number,
  signal?: AbortSignal,
): Promise<AddressHit> {
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat) });

  const resp = await fetch(`${apiBase()}/api/geocode/reverse?${params.toString()}`, {
    signal,
    cache: "no-store",
  });

  const body = await safeReadJson(resp);
  if (!resp.ok) {
    throw parseUpstreamError(body);
  }
  if (typeof body !== "object" || body === null) {
    throw new ScoutApiError("Geocode payload malformed.", "GEOCODE_FAILED");
  }

  const hit = parseAddressHit((body as { hit?: unknown }).hit);
  if (hit === null) {
    throw new ScoutApiError("Geocode payload malformed.", "GEOCODE_FAILED");
  }
  return hit;
}

export interface CorridorResponse {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
  meta: {
    truncated: boolean;
    time_taken_ms: number;
    feature_count_total: number;
  };
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
      buffer_meters: payload.buffer_meters ?? CORRIDOR_BUFFER_METERS,
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
    typeof metaUnknown.time_taken_ms !== "number" ||
    typeof metaUnknown.feature_count_total !== "number"
  ) {
    throw new ScoutApiError("Corridor metadata malformed.");
  }

  return body as CorridorResponse;
}

/** Parsed from `features[0].properties` on `POST /api/route` (M1-F04). */
export interface RouteSummaryPayload {
  distanceMeters: number;
  durationSeconds: number;
  fallbackProfileUsed: boolean;
  warnings: readonly string[];
}

/** Successful `fetchRoute` return value — line geometry + summary for UI. */
export interface RouteComputeResult {
  line: GeoJSON.Feature<GeoJSON.LineString>;
  summary: RouteSummaryPayload;
  response: GeoJSON.FeatureCollection & {
    features: GeoJSON.Feature<GeoJSON.LineString>[];
  };
}

function parseRouteWarnings(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string");
}

/** `POST /api/route` — wheelchair walking directions (M1-F04 wire contract). */
export async function fetchRoute(
  payload: {
    from: readonly [lon: number, lat: number];
    to: readonly [lon: number, lat: number];
    profile?: "wheelchair";
  },
  signal?: AbortSignal,
): Promise<RouteComputeResult> {
  const resp = await fetch(`${apiBase()}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: [...payload.from],
      to: [...payload.to],
      profile: payload.profile ?? "wheelchair",
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
    (body as { type?: unknown }).type !== "FeatureCollection"
  ) {
    throw new ScoutApiError("Route payload malformed.");
  }

  const featuresUnknown = (body as { features?: unknown }).features;
  if (!Array.isArray(featuresUnknown) || featuresUnknown.length === 0) {
    throw new ScoutApiError("Route geometry missing.");
  }

  const first = featuresUnknown[0];
  if (
    typeof first !== "object" ||
    first === null ||
    typeof (first as { type?: unknown }).type !== "string" ||
    (first as GeoJSON.Feature).type !== "Feature"
  ) {
    throw new ScoutApiError("Route feature malformed.");
  }

  const geometry = (first as GeoJSON.Feature).geometry;
  if (
    geometry === null ||
    typeof geometry !== "object" ||
    geometry.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2
  ) {
    throw new ScoutApiError("Route LineString malformed.");
  }

  const props = (first as GeoJSON.Feature).properties;
  const rec =
    typeof props === "object" && props !== null
      ? (props as Record<string, unknown>)
      : {};

  const distanceMeters = rec["distance_meters"];
  const durationSeconds = rec["duration_seconds"];
  const fallbackProfileUsed = rec["fallback_profile_used"];
  const warnings = parseRouteWarnings(rec["warnings"]);

  if (
    typeof distanceMeters !== "number" ||
    typeof durationSeconds !== "number" ||
    typeof fallbackProfileUsed !== "boolean"
  ) {
    throw new ScoutApiError("Route summary properties malformed.");
  }

  const line = first as GeoJSON.Feature<GeoJSON.LineString>;

  const summary: RouteSummaryPayload = {
    distanceMeters,
    durationSeconds,
    fallbackProfileUsed,
    warnings,
  };

  const response = body as GeoJSON.FeatureCollection & {
    features: GeoJSON.Feature<GeoJSON.LineString>[];
  };

  return { line, summary, response };
}
