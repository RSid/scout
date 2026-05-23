"use client";

import type { GeoJSON } from "geojson";
import { noLabels } from "protomaps-themes-base";

import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import { Protocol } from "pmtiles";
import { useEffect, useMemo, useRef } from "react";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

import { useAnnounce } from "@/components/a11y/AnnounceProvider";

import { colorVar } from "@/design/tokens/colors";

import type { CorridorResponse } from "@/lib/api";
import { en } from "@/lib/i18n/messages";

type BasemapInnerProps = Readonly<{
  corridor: CorridorResponse["features"];
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
}>;

/** Idempotent registry so React strict mode / HMR do not double-register the protocol tile handler. */
const scoutPmtilesProtocol = new Protocol();
let scoutPmtilesRegistered = false;

function registerScoutPmtilesProtocol(): void {
  if (scoutPmtilesRegistered) {
    return;
  }

  scoutPmtilesRegistered = true;
  maplibregl.addProtocol(
    "pmtiles",
    scoutPmtilesProtocol.tile.bind(scoutPmtilesProtocol),
  );
}

function featureCollection(feats: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: structuredClone(feats),
  };
}

export default function BasemapInner({ corridor, route }: BasemapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const announce = useAnnounce();
  const preparedMarkers = useMemo(() => corridor.map(markKind), [corridor]);
  const markerCollection = useMemo(
    () => featureCollection(preparedMarkers),
    [preparedMarkers],
  );

  // Latest props mirrored to refs so the mount-only `map.on('load')` handler
  // can read fresh data when it finally fires, without re-creating the map.
  const markerCollectionRef = useRef(markerCollection);
  const routeRef = useRef(route);
  useEffect(() => {
    markerCollectionRef.current = markerCollection;
  }, [markerCollection]);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof window === "undefined") {
      return undefined;
    }

    registerScoutPmtilesProtocol();

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const map = new maplibregl.Map({
      container: element,
      style: buildDcBasemapStyle(prefersDarkScheme),
      center: [-77.0369, 38.9072],
      zoom: 12,
      interactive: true,
      keyboard: true,
    });
    mapRef.current = map;

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

    function currentRouteFc(): GeoJSON.FeatureCollection {
      const r = routeRef.current;
      return r ? featureCollection([r]) : EMPTY_FC;
    }

    map.on("load", () => {
      map.addSource("route-line", {
        type: "geojson",
        data: currentRouteFc(),
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
        data: markerCollectionRef.current,
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
      announce("Interactive map paused because Scout could not load its local tiles.");
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

    // The container can mount at 0 px (Tailwind CSS injection lags React layout
    // in Next dev). MapLibre falls back to canvas height 300 in that case and
    // never re-measures on its own — observe the container so a late layout
    // pass triggers a proper resize.
    map.resize();
    const rafHandle = window.requestAnimationFrame(() => map.resize());
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(element);

    return () => {
      window.cancelAnimationFrame(rafHandle);
      resizeObserver.disconnect();
      canvas.removeEventListener("keydown", handleCanvasKey);

      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [announce]);

  // Push corridor data through to the live map without destroying it. Gated on
  // isStyleLoaded so updates that land before 'load' are absorbed by the load
  // handler reading from the ref instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) {
      return;
    }
    const src = map.getSource("cluster-points") as maplibregl.GeoJSONSource | undefined;
    src?.setData?.(markerCollection);
  }, [markerCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) {
      return;
    }
    const src = map.getSource("route-line") as maplibregl.GeoJSONSource | undefined;
    const data = route ? featureCollection([route]) : EMPTY_FC;
    src?.setData?.(data);
  }, [route]);

  return (
    <div className="relative w-full">
      <p id="scout-map-keyboard-hint" className="sr-only">
        {en.mapPlanKeyboardHint}
      </p>
      {/* MapLibre adds .maplibregl-map (position: relative + overflow: hidden) to
          the mount node; sizing it directly avoids the absolute+inset-0 trick
          getting overridden by that class. Overlays stay positioned against
          the relative wrapper above. */}
      <div
        ref={containerRef}
        role="application"
        aria-label={en.mapPlanAriaLabel}
        aria-describedby="scout-map-keyboard-hint"
        data-testid="basemap-shell"
        tabIndex={0}
        className="min-h-[640px] w-full overflow-hidden rounded-tokenLg border border-border bg-surface-elevated"
      />
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

function buildDcBasemapStyle(
  prefersDarkScheme: boolean,
): maplibregl.StyleSpecification {
  const sourceId = "scout_dc_basemap";
  const themeKey = prefersDarkScheme ? "dark" : "light";

  const layers = noLabels(sourceId, themeKey);

  return {
    version: 8,
    sources: {
      [sourceId]: {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (Open Database License). Tiles via Protomaps.',
        type: "vector",
        url: "pmtiles:///tiles/dc.pmtiles",
      },
    },
    layers,
  };
}
