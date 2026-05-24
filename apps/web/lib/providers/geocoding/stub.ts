import type { AddressHit, GeocodingProvider, GeocodingSearchOptions } from "./protocol";

/** Deterministic hits for Vitest / Playwright (no live geocoder upstream). */
export const STUB_SEARCH_HITS: readonly AddressHit[] = [
  {
    id: "stub-14th-u",
    label: "1400 U Street Northwest, Washington, DC 20009, United States",
    lon: -77.0366,
    lat: 38.9169,
  },
  {
    id: "stub-dupont",
    label: "Dupont Circle, Washington, District of Columbia 20009, United States",
    lon: -77.0369,
    lat: 38.9097,
  },
];

function sleep(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }

    const onAbort = (): void => {
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort);
    queueMicrotask(() => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted === true) {
        reject(signal.reason);
        return;
      }
      resolve();
    });
  });
}

async function filteredSearchHits(
  query: string,
  opts: GeocodingSearchOptions | undefined,
): Promise<readonly AddressHit[]> {
  const trimmed = query.trim().toLowerCase();
  const limit = typeof opts?.limit === "number" ? Math.min(opts.limit, 10) : 5;

  if (trimmed.length < 3) {
    return [];
  }

  const firstHit = STUB_SEARCH_HITS[0];
  const matches: readonly AddressHit[] =
    trimmed.includes("dupont") || trimmed.includes("14th") || trimmed.includes("14 ")
      ? STUB_SEARCH_HITS
      : firstHit
        ? [firstHit]
        : [];

  return matches.slice(0, limit);
}

export const stubGeocodingProvider: GeocodingProvider = {
  async search(query: string, options: GeocodingSearchOptions | undefined, signal?) {
    await sleep(signal);
    return [...(await filteredSearchHits(query, options))];
  },

  async reverse(_lon: number, _lat: number, signal?) {
    await sleep(signal);
    void _lon;
    void _lat;
    // Label is intentionally an obvious non-address so a developer who clicks
    // "Use my location" cannot mistake this fixture for a real reverse-geocode
    // result. Flip NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER=backend (or run
    // `make docker-up-realistic-run`) to hit Scout's `/api/geocode/reverse`
    // (Photon upstream via the backend adapter, per DEC-022) instead.
    return {
      id: "stub-reverse-1",
      label:
        "[STUB] Reverse-geocode fixture — set NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER=backend for real results",
      lon: -77.0324,
      lat: 38.8997,
    };
  },
};
