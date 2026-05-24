/**
 * Scout-domain geocoding boundary (DEC-020, DEC-022). Caller code depends
 * only on these types — never on Photon (or any other engine's) wire
 * payloads. Adapters translate at the boundary.
 */

export interface AddressHit {
  readonly id: string;
  readonly label: string;
  readonly lon: number;
  readonly lat: number;
}

export interface GeocodingSearchOptions {
  readonly limit?: number | undefined;
}

export interface GeocodingProvider {
  search(
    query: string,
    options: GeocodingSearchOptions | undefined,
    signal?: AbortSignal,
  ): Promise<readonly AddressHit[]>;

  reverse(lon: number, lat: number, signal?: AbortSignal): Promise<AddressHit>;
}
