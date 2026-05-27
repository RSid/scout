// TODO(M1-F11): refresh once ingestion produces real per-row inspected_year aggregates.

/** DC Open Data / external dataset row for static landing attribution (NO live DB calls). */
export type DataSource = {
  /** Stable slug for stable keys/tests */
  id: string;
  label: string;
  url: string;
  /** Most recent YEAR_INSPECTED (or equivalent) represented in bundled source files; API-only sources may omit. */
  lastInspectedYear: number | null;
};

const BASE_TRANSPORT_ADA =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_ADA_WebMercator/MapServer";

/** Per-dataset human-facing layer pages on DC GIS Transportation ADA WebMercator (appendix §B). */
export const DATA_SOURCES: readonly DataSource[] = [
  {
    id: "audible_signals",
    label: "ADA inspections — audible pedestrian signals",
    url: `${BASE_TRANSPORT_ADA}/0`,
    lastInspectedYear: 2016,
  },
  {
    id: "barriers",
    label: "ADA inspections — barriers in the public right of way",
    url: `${BASE_TRANSPORT_ADA}/1`,
    lastInspectedYear: 2016,
  },
  {
    id: "bus_stops",
    label: "ADA inspections — bus stops",
    url: `${BASE_TRANSPORT_ADA}/2`,
    lastInspectedYear: 2016,
  },
  {
    id: "curb_ramps",
    label: "ADA inspections — curb ramps",
    url: `${BASE_TRANSPORT_ADA}/3`,
    lastInspectedYear: 2016,
  },
  {
    id: "driveways",
    label: "ADA inspections — driveways",
    url: `${BASE_TRANSPORT_ADA}/4`,
    lastInspectedYear: 2016,
  },
  {
    id: "median_cut_throughs",
    label: "ADA inspections — median cut-throughs",
    url: `${BASE_TRANSPORT_ADA}/5`,
    lastInspectedYear: 2016,
  },
  {
    id: "restrooms",
    label: "Refuge Restrooms",
    url: "https://www.refugerestrooms.org/",
    lastInspectedYear: null,
  },
  {
    id: "rest_spots_osm",
    label: "OpenStreetMap — benches",
    url: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    lastInspectedYear: null,
  },
  {
    id: "water_osm",
    label: "OpenStreetMap — drinking fountains",
    url: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    lastInspectedYear: null,
  },
] satisfies readonly DataSource[];

/**
 * appendix-data-schema §D (> 3 years): show the outdated chip when inspection year exists and is stale.
 */
export function isInspectionOutdated(
  year: number | null,
  referenceYear: number,
): boolean {
  return year !== null && referenceYear - year > 3;
}

export type InspectionFreshnessTreatment =
  | { kind: "recent" }
  | { kind: "as_of"; year: number }
  | { kind: "stale_chip"; year: number }
  | { kind: "unknown" };

/** appendix-data-schema §D thresholds for popup + parallel list rows. */
export function inspectionFreshnessTreatment(
  year: number | null,
  referenceYear: number,
): InspectionFreshnessTreatment {
  if (year === null) {
    return { kind: "unknown" };
  }
  const age = referenceYear - year;
  if (age <= 1) {
    return { kind: "recent" };
  }
  if (age <= 3) {
    return { kind: "as_of", year };
  }
  return { kind: "stale_chip", year };
}
