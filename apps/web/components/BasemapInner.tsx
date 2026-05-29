"use client";

import type { ApiCategory, CorridorResponse } from "@/lib/api";
import type { GeoJSON } from "geojson";
import { noLabels } from "protomaps-themes-base";
import maplibregl from "maplibre-gl";
/**
 * MapLibre's stylesheet is REQUIRED. It includes
 * `.maplibregl-canvas { position: absolute }` (and friends), which take the
 * `<canvas>` out of normal flow. Without it the canvas is in-flow, its
 * line-leading height feeds back into the container's content height, the
 * ResizeObserver re-triggers `map.resize()`, and the container grows by a
 * few px per frame until the GL buffer hits the 4096-texture cap (the CSS
 * box keeps stretching past 100k px). Side-effect import only — Tailwind
 * leaves this CSS untouched and there is no clash with our tokens.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { createRoot, type Root } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MarkerKeyboardRail, {
  corridorPointFeatureIds,
  railDomId,
} from "@/components/a11y/MarkerKeyboardRail";
import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import FeaturePopup from "@/components/FeaturePopup";
import {
  corridorFeatureWithMarkerSeverity,
  registerScoutRouteMarkerSprites,
} from "@/lib/map/markers";
import { resolveColorToken } from "@/design/tokens/colors";
import { corridorClusterMixAnnouncement, en } from "@/lib/i18n/messages";
import { useProfile } from "@/lib/profile";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Tally a cluster's leaves into label+count parts, busiest category first, so
 * the screen-reader text can read "3 curb ramps, 2 barriers" (DEC-024 §2). */
function clusterCategoryParts(
  leaves: readonly GeoJSON.Feature[],
  categoryById: ReadonlyMap<string, ApiCategory>,
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const leaf of leaves) {
    const category = leaf.properties?.["category"];
    if (typeof category === "string") {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ label: categoryById.get(id)?.label ?? id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Bounding box over a cluster's member points; null when no usable coords. */
function lngLatBoundsForLeaves(
  leaves: readonly GeoJSON.Feature[],
): maplibregl.LngLatBoundsLike | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let seen = false;

  for (const leaf of leaves) {
    if (leaf.geometry.type !== "Point") {
      continue;
    }
    const [lon, lat] = leaf.geometry.coordinates;
    if (lon === undefined || lat === undefined) {
      continue;
    }
    seen = true;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return seen
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

function lngLatBoundsForRoute(
  line: GeoJSON.LineString,
): maplibregl.LngLatBoundsLike | null {
  const coords = line.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let seen = false;

  for (const coord of coords) {
    const lon = coord[0];
    const lat = coord[1];
    if (lon === undefined || lat === undefined) {
      continue;
    }

    seen = true;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  if (!seen) {
    return null;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function fitMapViewportToRoute(
  map: maplibregl.Map,
  line: GeoJSON.LineString,
  opts?: Readonly<{ preferInstant?: boolean }>,
): void {
  const fitted = lngLatBoundsForRoute(line);
  if (fitted === null) {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimate = opts?.preferInstant !== true && reduceMotion === false;
  map.fitBounds(fitted, {
    padding: 48,
    maxZoom: 16,
    animate: shouldAnimate,
    duration: shouldAnimate ? 600 : 0,
  });
}

export type BasemapInnerProps = Readonly<{
  corridor: CorridorResponse["features"];
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
  selectedFeatureId?: string | null | undefined;
  onSelectFeature?: ((id: string | null) => void) | undefined;
}>;

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

function featureIdCandidate(feature: GeoJSON.Feature): string | null {
  if (feature.id !== undefined && feature.id !== null) {
    return String(feature.id);
  }

  const raw = feature.properties as Record<string, unknown> | undefined;
  if (raw?.id !== undefined && raw?.id !== null) {
    return String(raw.id as string | number | boolean);
  }

  return null;
}

export default function BasemapInner({
  corridor,
  route,
  selectedFeatureId = null,
  onSelectFeature,
}: BasemapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupShellRef = useRef<maplibregl.Popup | null>(null);
  const popupDomRootRef = useRef<Root | null>(null);
  const popupCloseHandlerRef = useRef<(() => void) | null>(null);
  const lastAnnouncedClusterRef = useRef<number>(-1);
  const popupRailSnapRef = useRef<number | null>(null);

  /** One instant fit per map instance prevents double anim + tile-loading shimmer. */
  const pendingInitialRouteViewportRef = useRef(true);

  /**
   * StrictMode in dev mounts effects twice (mount → cleanup → mount) to flush
   * effect-local bugs. For external WebGL resources that is catastrophic: it
   * tears down the live MapLibre instance and rebuilds it from scratch,
   * cancelling in-flight tile fetches mid-render. The user perceives this as
   * the canvas appearing, vanishing into the cream container background, and
   * reappearing — i.e. "the map is flickering grey". We guard the heavy
   * setup by deferring the destructive teardown via `setTimeout(0)`; the
   * second StrictMode mount cancels the pending teardown and adopts the
   * existing instance. Real unmount lets the timer fire and tears down for
   * real.
   */
  const mapBootstrapRef = useRef<{
    teardown: () => void;
    pendingTeardownTimer: number;
  } | null>(null);

  const corridorPrepared = useMemo(
    () => corridor.map(corridorFeatureWithMarkerSeverity),
    [corridor],
  );

  const corridorPointRows = useMemo(
    () => corridorPointFeatureIds(corridorPrepared),
    [corridorPrepared],
  );

  const markerCollection = useMemo(
    () => featureCollection(corridorPrepared as GeoJSON.Feature[]),
    [corridorPrepared],
  );

  const corridorPointRowsRef = useRef(corridorPointRows);
  const categoryByIdRef = useRef(new Map<string, ApiCategory>());
  const markerCollectionRef = useRef(markerCollection);
  const routeRef = useRef(route);

  useEffect(() => {
    corridorPointRowsRef.current = corridorPointRows;
  }, [corridorPointRows]);

  useEffect(() => {
    markerCollectionRef.current = markerCollection;
  }, [markerCollection]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const { categories } = useProfile();

  const categoryById = useMemo(() => {
    const m = new Map<string, ApiCategory>();
    categories.forEach((row) => m.set(row.id, row));
    return m;
  }, [categories]);

  useEffect(() => {
    categoryByIdRef.current = categoryById;
  }, [categoryById]);

  const announce = useAnnounce();
  const [railFocusIdx, setRailFocusIdx] = useState(0);
  const [railFocusTriggeredPan, setRailFocusTriggeredPan] = useState(false);
  const [scoutMapBootstrapDone, setScoutMapBootstrapDone] = useState(false);

  useEffect(() => {
    const maxIdx = corridorPointRows.length <= 1 ? 0 : corridorPointRows.length - 1;
    setRailFocusIdx((previous) => Math.max(0, Math.min(previous, maxIdx)));
  }, [corridorPointRows]);

  /** Pan only — popups lift from `selectedFeatureId` coordination. */
  const flyToRow = useCallback(
    (rowIndex: number): void => {
      const map = mapRef.current;
      const rows = corridorPointRowsRef.current;
      const target = rows[rowIndex];
      if (!map || !scoutMapBootstrapDone || target?.geometry?.type !== "Point") {
        return;
      }
      const [lonRaw, latRaw] = target.geometry.coordinates;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.easeTo({
        center: [Number(lonRaw), Number(latRaw)],
        zoom: Math.max(map.getZoom(), 16),
        animate: reduceMotion !== true,
        duration: reduceMotion ? 0 : 360,
      });
    },
    [scoutMapBootstrapDone],
  );

  const clearPopupRendering = useCallback(() => {
    popupRailSnapRef.current = null;

    popupDomRootRef.current?.unmount();
    popupDomRootRef.current = null;
    const popup = popupShellRef.current;
    if (popup !== null && popupCloseHandlerRef.current !== null) {
      popup.off("close", popupCloseHandlerRef.current);
    }
    popupCloseHandlerRef.current = null;
    popup?.remove();
  }, []);

  const mountPopupRow = useCallback(
    (rowIndex: number): void => {
      const map = mapRef.current;
      const popup = popupShellRef.current;
      const rows = corridorPointRowsRef.current;
      const target = rows[rowIndex];
      if (
        map === null ||
        popup === null ||
        !scoutMapBootstrapDone ||
        target?.geometry?.type !== "Point"
      ) {
        return;
      }

      const [lonRaw, latRaw] = target.geometry.coordinates;
      const lon = Number(lonRaw);
      const lat = Number(latRaw);

      flyToRow(rowIndex);

      const props = target.properties as Record<string, unknown> | undefined;
      const catId = typeof props?.category === "string" ? props.category : null;
      const cat = catId !== null ? (categoryByIdRef.current.get(catId) ?? null) : null;

      clearPopupRendering();

      const mount = globalThis.document.createElement("div");
      const root = createRoot(mount);
      popupDomRootRef.current = root;

      root.render(
        <FeaturePopup
          category={cat}
          feature={target as CorridorResponse["features"][number]}
        />,
      );

      const openedRailRow = rowIndex;
      const onClose = (): void => {
        popupRailSnapRef.current = null;
        popupDomRootRef.current?.unmount();
        popupDomRootRef.current = null;
        popupCloseHandlerRef.current = null;
        onSelectFeature?.(null);
        queueMicrotask(() => {
          globalThis.document.getElementById(railDomId(openedRailRow))?.focus();
        });
      };

      if (popupCloseHandlerRef.current !== null) {
        popup.off("close", popupCloseHandlerRef.current);
      }
      popupCloseHandlerRef.current = onClose;
      popup.on("close", onClose);

      popup.setDOMContent(mount);
      popup.setLngLat({ lng: lon, lat }).addTo(map);
      popupRailSnapRef.current = rowIndex;
    },
    [clearPopupRendering, flyToRow, onSelectFeature, scoutMapBootstrapDone],
  );

  useEffect(() => {
    if (!railFocusTriggeredPan) {
      return;
    }
    setRailFocusTriggeredPan(false);
    flyToRow(railFocusIdx);
  }, [flyToRow, railFocusIdx, railFocusTriggeredPan]);

  useEffect(() => {
    if (!scoutMapBootstrapDone) {
      return;
    }
    if (typeof selectedFeatureId !== "string" || selectedFeatureId.length === 0) {
      clearPopupRendering();
      return;
    }

    const rows = corridorPointRowsRef.current;
    const idx = rows.findIndex(
      (row) => row !== undefined && featureIdCandidate(row) === selectedFeatureId,
    );
    if (idx === -1) {
      clearPopupRendering();
      return;
    }

    setRailFocusIdx(idx);
    mountPopupRow(idx);
    queueMicrotask(() => {
      globalThis.document.getElementById(railDomId(idx))?.focus();
    });
  }, [clearPopupRendering, mountPopupRow, scoutMapBootstrapDone, selectedFeatureId]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof window === "undefined") {
      return undefined;
    }

    /**
     * Schedules the heavy teardown for the next macrotask. If a StrictMode
     * synthetic re-mount lands first, it clears this timer and the live map
     * survives. Otherwise the timer fires and we release the WebGL context.
     */
    const scheduleDeferredTeardown = (): void => {
      const ref = mapBootstrapRef.current;
      if (ref === null) {
        return;
      }
      ref.pendingTeardownTimer = window.setTimeout(() => {
        ref.teardown();
        mapBootstrapRef.current = null;
      }, 0);
    };

    /** StrictMode 2nd mount: cancel deferred teardown, reuse existing map. */
    if (mapBootstrapRef.current !== null) {
      window.clearTimeout(mapBootstrapRef.current.pendingTeardownTimer);
      mapBootstrapRef.current.pendingTeardownTimer = 0;
      return scheduleDeferredTeardown;
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
    popupShellRef.current = new maplibregl.Popup({
      closeButton: true,
      anchor: "top",
      maxWidth: "320px",
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const canvas = map.getCanvasContainer();

    function handleCanvasKey(evt: KeyboardEvent) {
      if (evt.key === "Escape") {
        const rowSnap = popupRailSnapRef.current;
        clearPopupRendering();
        onSelectFeature?.(null);
        queueMicrotask(() => {
          if (rowSnap !== null) {
            globalThis.document.getElementById(railDomId(rowSnap))?.focus();
          }
        });
      }
    }

    canvas.addEventListener("keydown", handleCanvasKey);

    map.on("load", () => {
      void (async () => {
        try {
          await registerScoutRouteMarkerSprites(map);
        } catch {
          announce(en.mapSpriteLoadFailure);
          return;
        }

        map.addSource("route-line", {
          type: "geojson",
          data: routeRef.current ? featureCollection([routeRef.current]) : EMPTY_FC,
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
            "line-color": resolveColorToken("accent"),
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
            "circle-color": resolveColorToken("text-muted"),
            "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 20, 20],
            "circle-stroke-color": resolveColorToken("surface"),
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "cluster-points",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "point_count"]],
            "text-size": 12,
          },
          paint: {
            "text-color": resolveColorToken("text-inverse"),
            "text-halo-color": resolveColorToken("text-muted"),
            "text-halo-width": 1,
          },
        });

        map.addLayer({
          id: "markers",
          type: "symbol",
          source: "cluster-points",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": [
              "concat",
              ["coalesce", ["to-string", ["get", "category"]], "unknown"],
              ":",
              ["coalesce", ["to-string", ["get", "scout_severity"]], "mild"],
            ],
            "icon-size": 0.92,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        map.on("click", "clusters", (evt) => {
          const hit = evt.features?.[0];
          if (!hit || hit.geometry.type !== "Point") {
            return;
          }

          const clusterCount = Number(hit.properties?.point_count ?? NaN);
          const clusterRaw = Number(hit.properties?.cluster_id ?? NaN);
          if (Number.isNaN(clusterRaw)) {
            return;
          }

          const clusterSource = map.getSource(
            "cluster-points",
          ) as maplibregl.GeoJSONSource;

          const announceCount = (): void => {
            if (Number.isNaN(clusterCount)) {
              return;
            }
            lastAnnouncedClusterRef.current = clusterCount;
            announce(
              en.corridorClusterGroupedTemplate.replace("{n}", String(clusterCount)),
            );
          };

          void clusterSource
            .getClusterLeaves(clusterRaw, Infinity, 0)
            .then((leaves) => {
              // DEC-024 §2: read the category mix on activation, deduped per size.
              if (
                !Number.isNaN(clusterCount) &&
                clusterCount !== lastAnnouncedClusterRef.current
              ) {
                lastAnnouncedClusterRef.current = clusterCount;
                announce(
                  corridorClusterMixAnnouncement(
                    clusterCount,
                    clusterCategoryParts(leaves, categoryByIdRef.current),
                  ),
                );
              }

              // Frame the members directly; fitBounds decomposes the cluster more
              // reliably than a center+zoom guess.
              const bounds = lngLatBoundsForLeaves(leaves);
              if (bounds === null) {
                map.zoomIn({ animate: prefersReducedMotion ? false : true });
                return;
              }
              map.fitBounds(bounds, {
                padding: 64,
                maxZoom: 17,
                animate: prefersReducedMotion ? false : true,
                duration: prefersReducedMotion ? 0 : 360,
              });
            })
            .catch(() => {
              if (
                !Number.isNaN(clusterCount) &&
                clusterCount !== lastAnnouncedClusterRef.current
              ) {
                announceCount();
              }
              map.zoomIn({ animate: prefersReducedMotion ? false : true });
            });
        });

        map.on("click", "markers", (evt) => {
          const marker = evt.features?.[0];
          if (!marker || marker.geometry.type !== "Point") {
            return;
          }

          const hitId = featureIdCandidate(marker as GeoJSON.Feature);
          if (hitId !== null) {
            onSelectFeature?.(hitId);
          }
        });

        setScoutMapBootstrapDone(true);
      })().catch(() => {
        announce(en.mapGenericLoadFailure);
      });
    });

    map.on("error", () => {
      announce(en.mapGenericLoadFailure);
    });

    /** Coalesce ResizeObserver bursts (flex layout / font / panels) → at most one resize per frame. */
    let resizeRafHandle = 0;
    const scheduleResize = (): void => {
      if (resizeRafHandle !== 0) {
        return;
      }

      resizeRafHandle = window.requestAnimationFrame(() => {
        resizeRafHandle = 0;
        map.resize();
      });
    };

    map.resize();

    scheduleResize();

    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });

    resizeObserver.observe(element);

    const teardown = (): void => {
      if (resizeRafHandle !== 0) {
        window.cancelAnimationFrame(resizeRafHandle);
        resizeRafHandle = 0;
      }

      pendingInitialRouteViewportRef.current = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("keydown", handleCanvasKey);
      clearPopupRendering();
      popupShellRef.current?.remove();
      popupShellRef.current = null;
      map.remove();
      mapRef.current = null;
      setScoutMapBootstrapDone(false);
    };

    mapBootstrapRef.current = { teardown, pendingTeardownTimer: 0 };

    return scheduleDeferredTeardown;
  }, [announce, clearPopupRendering, onSelectFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || scoutMapBootstrapDone !== true || !map.isStyleLoaded?.()) {
      return;
    }

    const src = map.getSource("cluster-points") as maplibregl.GeoJSONSource | undefined;
    src?.setData?.(markerCollection);
  }, [markerCollection, scoutMapBootstrapDone]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || scoutMapBootstrapDone !== true || !map.isStyleLoaded?.()) {
      return;
    }

    const src = map.getSource("route-line") as maplibregl.GeoJSONSource | undefined;
    const data = route !== null ? featureCollection([route]) : EMPTY_FC;
    src?.setData?.(data);

    if (
      typeof window !== "undefined" &&
      route !== null &&
      route.geometry.coordinates.length >= 2
    ) {
      const preferInstant =
        pendingInitialRouteViewportRef.current ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      pendingInitialRouteViewportRef.current = false;
      fitMapViewportToRoute(map, route.geometry, { preferInstant });
    }
  }, [route, scoutMapBootstrapDone]);

  const handleRailFocusChange = useCallback((nextIndex: number) => {
    setRailFocusIdx(nextIndex);
    setRailFocusTriggeredPan(true);
  }, []);

  const handleRailActivate = useCallback(
    (rowIndex: number) => {
      const row = corridorPointRows[rowIndex];
      const fid = row !== undefined ? featureIdCandidate(row) : null;
      if (fid !== null) {
        onSelectFeature?.(fid);
      }
    },
    [corridorPointRows, onSelectFeature],
  );

  return (
    <div className="relative w-full">
      <p id="scout-map-keyboard-hint" className="sr-only">
        {en.mapPlanKeyboardHint}
      </p>
      <div
        ref={containerRef}
        role="application"
        aria-label={en.mapPlanAriaLabel}
        aria-describedby="scout-map-keyboard-hint"
        data-testid="basemap-shell"
        tabIndex={0}
        className="min-h-[640px] w-full overflow-hidden rounded-tokenLg border border-border bg-surface-elevated"
      />
      <MarkerKeyboardRail
        categoryById={categoryById}
        features={corridorPrepared}
        focusedIndex={railFocusIdx}
        onFocusedIndexChange={handleRailFocusChange}
        onActivateRow={handleRailActivate}
        disabled={!scoutMapBootstrapDone || corridorPointRows.length === 0}
      />
      <div className="pointer-events-none absolute left-[var(--space-4)] top-[var(--space-4)] z-[1] max-w-xs rounded-tokenSm bg-surface px-[var(--space-3)] py-[var(--space-2)] text-xs text-[color:var(--color-text-muted)] shadow-modal">
        {en.mapMarkersLegend}
      </div>
      <noscript>
        Activate JavaScript so we can initialise the Scout map viewport.
      </noscript>
    </div>
  );
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
