import type { GeoJSON } from "geojson";

/** Format distance alongside list summaries (nearest meter). */
export function formatApproxMeters(distance: number): string {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("distance must be a finite positive number.");
  }

  const rounded = Math.round(distance);
  const unit = rounded === 1 ? "meter" : "meters";
  return `~${rounded} ${unit}`;
}

/** Very small planar fallback for Lon/Lat deltas (degrees → meters-ish). Not for litigation routing. */
export function roughDistanceMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const metersPerDegLat = 111_132;
  const metersPerDegLon = Math.cos((lat1 * Math.PI) / 180) * 111_320;
  return Math.sqrt((dLat * metersPerDegLat) ** 2 + (dLon * metersPerDegLon) ** 2);
}

export function summarizeLineStringDegrees(
  line: GeoJSON.LineString["coordinates"],
  pointLon: number,
  pointLat: number,
): { alongMetersRough: number; crossMetersRough: number } {
  let best = Infinity;
  let accumulated = 0;

  if (line.length < 2) {
    throw new RangeError("LineString must include at least two coordinates.");
  }

  for (let i = 0; i < line.length - 1; i++) {
    const segStart = line[i];
    const segEnd = line[i + 1];
    if (!segStart || !segEnd || segStart.length < 2 || segEnd.length < 2) {
      throw new RangeError("LineString segment has invalid coordinate.");
    }
    const x1 = segStart[0];
    const y1 = segStart[1];
    const x2 = segEnd[0];
    const y2 = segEnd[1];
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      throw new RangeError("LineString segment has incomplete coordinate.");
    }

    const segLen = roughDistanceMeters(x1, y1, x2, y2);
    const d = roughDistanceMeters(pointLon, pointLat, x1, y1);
    best = Math.min(best, d);
    const alt = roughDistanceMeters(pointLon, pointLat, x2, y2);
    best = Math.min(best, alt);
    accumulated += segLen;
  }

  const last = line[line.length - 1];
  if (!last || last.length < 2) {
    throw new RangeError("Missing terminal coordinate.");
  }

  const lastLon = last[0];
  const lastLat = last[1];
  if (lastLon === undefined || lastLat === undefined) {
    throw new RangeError("Missing terminal coordinate.");
  }

  best = Math.min(best, roughDistanceMeters(pointLon, pointLat, lastLon, lastLat));

  return { alongMetersRough: accumulated, crossMetersRough: best };
}
