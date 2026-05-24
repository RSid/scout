import { backendGeocodingProvider } from "./backend";
import type { GeocodingProvider } from "./protocol";
import { stubGeocodingProvider } from "./stub";

export type { AddressHit, GeocodingProvider, GeocodingSearchOptions } from "./protocol";
export { backendGeocodingProvider } from "./backend";
export { STUB_SEARCH_HITS, stubGeocodingProvider } from "./stub";

export function getGeocodingProvider(): GeocodingProvider {
  const impl = process.env.NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER ?? "backend";
  if (impl === "stub") {
    return stubGeocodingProvider;
  }
  return backendGeocodingProvider;
}
