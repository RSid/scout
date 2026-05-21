"use client";

import type { GeoJSON } from "geojson";
import { useEffect, useMemo, useRef } from "react";

import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import { colorVar } from "@/design/tokens/colors";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";

import type { CorridorResponse } from "@/lib/api";

type BasemapInnerProps = Readonly<{
  corridor: CorridorResponse["features"];
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
}>;

function featureCollection(feats: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: structuredClone(feats),
  };
}

export default function BasemapInner({ corridor, route }: BasemapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const announce = useAnnounce();
  const preparedMarkers = useMemo(() => corridor.map(markKind), [corridor]);
  const markerCollection = useMemo(
    () => featureCollection(preparedMarkers),
    [preparedMarkers],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const map = new maplibregl.Map({
      container: element,
      style: buildStyle(),
      center: [-77.0365, 38.8977],
      zoom: 12,
      interactive: true,
      keyboard: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const popup = new maplibregl.Popup({
      closeButton: true,
      anchor: "top",
    });

    const canvas = map.getCanvasContainer();

    function handleCanvasKey(evt: KeyboardEvent) {
      if (evt.key === "Escape") {
        popup.remove();
      }
    }

    canvas.addEventListener("keydown", handleCanvasKey);

    const routeGeojson = route
      ? featureCollection([route])
      : { type: "FeatureCollection", features: [] };

    map.on("load", () => {
      map.addSource("route-line", {
        type: "geojson",
        data: routeGeojson as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-line",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": colorVar("accent"),
          "line-width": 5,
          "line-opacity": prefersReducedMotion ? 0.9 : 0.92,
        },
      });

      map.addSource("cluster-points", {
        type: "geojson",
        data: markerCollection,
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "cluster-points",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": colorVar("text-muted"),
          "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 20, 20],
          "circle-stroke-color": colorVar("surface"),
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: "markers",
        type: "circle",
        source: "cluster-points",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["coalesce", ["get", "scout_kind"], "obstacle"],
            "aid",
            colorVar("aid"),
            colorVar("obstacle-mild"),
          ],
          "circle-opacity": [
            "match",
            ["coalesce", ["get", "scout_kind"], "obstacle"],
            "aid",
            0.94,
            0.9,
          ],
          "circle-stroke-color": colorVar("surface"),
          "circle-stroke-width": 2,
        },
      });
    });

    map.on("error", () => {
      announce("Interactive map paused because upstream tiles refused to load.");
    });

    map.on("click", "clusters", (evt) => {
      const hit = evt.features?.[0];
      if (!hit || hit.geometry.type !== "Point") {
        return;
      }

      const clusterProp = Number(hit.properties?.cluster_id ?? NaN);
      const clusterSource = map.getSource("cluster-points") as maplibregl.GeoJSONSource;

      if (Number.isNaN(clusterProp)) {
        return;
      }

      void clusterSource
        .getClusterExpansionZoom(clusterProp)
        .then((zoom) => {
          map.easeTo({
            zoom: prefersReducedMotion ? zoom : zoom + 1,
            center: evt.lngLat,
            animate: prefersReducedMotion ? false : true,
            duration: prefersReducedMotion ? 0 : 360,
          });
        })
        .catch(() => {
          map.zoomIn({
            animate: prefersReducedMotion ? false : true,
          });
        });
    });

    map.on("click", "markers", (evt) => {
      const marker = evt.features?.[0];
      if (
        marker?.geometry?.type !== "Point" ||
        !marker.properties?.category ||
        !evt.lngLat
      ) {
        return;
      }

      const condition =
        typeof marker.properties.condition === "string"
          ? marker.properties.condition
          : "Condition unknown";

      popup
        .setLngLat(evt.lngLat)
        .setHTML(
          `<section tabindex="-1"><h4>${marker.properties.category}</h4><p>${condition}</p></section>`,
        );
      popup.addTo(map);

      popup.getElement()?.focus();
    });

    map.resize();

    return () => {
      canvas.removeEventListener("keydown", handleCanvasKey);

      popup.remove();
      map.remove();
    };
  }, [announce, markerCollection, route]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Interactive Scout map viewer"
      data-testid="basemap-shell"
      tabIndex={0}
      className="relative h-[min(70vh,_640px)] w-full overflow-hidden rounded-tokenLg border border-border bg-surface-elevated"
    >
      <div className="pointer-events-none absolute left-[var(--space-4)] top-[var(--space-4)] z-[1] rounded-tokenSm bg-surface px-[var(--space-3)] py-[var(--space-2)] text-sm text-[color:var(--color-text-muted)] shadow-modal">
        Markers encode aid vs obstacle with both color chips and captions.
      </div>
      <noscript>
        Activate JavaScript so we can initialise the Scout map viewport.
      </noscript>
    </div>
  );
}

function markKind(point: CorridorResponse["features"][number]): GeoJSON.Feature {
  const category =
    typeof point.properties?.category === "string"
      ? point.properties.category
      : "unknown";

  const aidish = category.includes("rest") || category.includes("shade");

  return {
    ...point,
    properties: {
      ...point.properties,
      scout_kind: aidish ? "aid" : "obstacle",
    },
  };
}

function buildStyle(): maplibregl.StyleSpecification {
  const rasterBase =
    process.env.NEXT_PUBLIC_MAP_RASTER_TILES ?? "https://tile.openstreetmap.org";

  /** Future: swap raster for `dc.pmtiles` once published metadata lists source-layer names. */

  const tiles = rasterBase.includes("{")
    ? [rasterBase]
    : [`${rasterBase}/{z}/{x}/{y}.png`];

  return {
    version: 8,
    sources: {
      scoutRaster: {
        attribution: "&copy; OpenStreetMap contributors",
        type: "raster",
        tileSize: 256,
        tiles,
      },
    },
    layers: [
      {
        id: "scout-basemap",
        type: "raster",
        source: "scoutRaster",
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}
