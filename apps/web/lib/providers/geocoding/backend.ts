import { reverseGeocode, searchGeocode } from "@/lib/api";

import type { AddressHit, GeocodingProvider, GeocodingSearchOptions } from "./protocol";

/**
 * Geocoding provider that calls Scout's own `/api/geocode/*` endpoints
 * (`DEC-022`). Browsers MUST go through this provider. The
 * backend handles vendor selection, rate limiting, User-Agent, and TOS
 * compliance.
 */
export const backendGeocodingProvider: GeocodingProvider = {
  async search(
    query: string,
    options: GeocodingSearchOptions | undefined,
    signal?: AbortSignal,
  ): Promise<readonly AddressHit[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }
    return await searchGeocode(trimmed, options, signal);
  },

  async reverse(lon: number, lat: number, signal?: AbortSignal): Promise<AddressHit> {
    return await reverseGeocode(lon, lat, signal);
  },
};
