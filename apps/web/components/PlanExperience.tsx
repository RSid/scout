"use client";

import SkipLink from "@/components/a11y/SkipLink";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import BasemapView from "@/components/BasemapView";
import FeatureListView from "@/components/FeatureListView";
import ProfilePanel from "@/components/ProfilePanel";
import RouteSummary, { type RouteSummaryMode } from "@/components/RouteSummary";
import StatusStrip from "@/components/StatusStrip";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";

import { DEMO_ROUTE, DEMO_ROUTE_SUMMARY } from "@/lib/fixtures/route-plan-fixtures";
import { derivePlannerStatus } from "@/lib/planner-status";

import {
  CORRIDOR_BUFFER_METERS,
  CORRIDOR_BUFFER_METERS_FALLBACK,
  fetchCorridorFeatures,
  fetchRoute,
  type CorridorResponse,
  type RouteSummaryPayload,
} from "@/lib/api";
import {
  corridorFetchSuccessAnnouncement,
  en,
  routeAnnouncementApproxFallback,
  routeAnnouncementLoaded,
} from "@/lib/i18n/messages";

import type { CorridorListingStatus } from "@/components/FeatureListView";

import type { AddressHit } from "@/lib/providers/geocoding";
import { prefersReducedMotion } from "@/lib/a11y";
import { useProfile } from "@/lib/profile";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function straightLinePreview(
  start: AddressHit,
  destination: AddressHit,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [start.lon, start.lat],
        [destination.lon, destination.lat],
      ],
    },
    properties: { source: "planner-straight-preview" },
  };
}

type RouteFetchSlice =
  | { kind: "unset" }
  | { kind: "loading"; routeKey: string }
  | {
      kind: "ok";
      routeKey: string;
      line: GeoJSON.Feature<GeoJSON.LineString>;
      summary: RouteSummaryPayload;
    }
  | { kind: "error"; routeKey: string };

export default function PlanExperience() {
  const announce = useAnnounce();
  const { categories, selections, isReady } = useProfile();

  const [startHit, setStartHit] = useState<AddressHit | null>(null);
  const [destinationHit, setDestinationHit] = useState<AddressHit | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const [corridorFeatures, setCorridorFeatures] = useState<
    CorridorResponse["features"]
  >(() => []);

  const [routeFetch, setRouteFetch] = useState<RouteFetchSlice>({ kind: "unset" });
  /** Ignores stale `fetchRoute` settles when endpoints change faster than upstream responds. */
  const desiredRouteKeyRef = useRef<string | null>(null);

  const [selectedCorridorFeatureId, setSelectedCorridorFeatureId] = useState<
    string | null
  >(null);

  /** Mobile-first: reveal map beneath `md`; desktop always reads as open (CSS via `md:`). */
  const [mobileMapOpen, setMobileMapOpen] = useState<boolean>(false);
  /** True when viewport width ≥ Tailwind `md` (768px). */
  const [matchesDesktopMd, setMatchesDesktopMd] = useState<boolean>(false);
  /** Corridor fetch UX for the paired list/map (M1-F09). */
  const [corridorListingStatus, setCorridorListingStatus] =
    useState<CorridorListingStatus>("idle");

  const mapShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mq = window.matchMedia("(min-width: 768px)");
    const syncViewport = (): void => {
      setMatchesDesktopMd(mq.matches === true);
      if (mq.matches === true) {
        setMobileMapOpen(true);
      } else {
        setMobileMapOpen(false);
      }
    };

    syncViewport();
    mq.addEventListener("change", syncViewport);

    return () => mq.removeEventListener("change", syncViewport);
  }, []);

  const enabledCategories = useMemo(() => {
    if (!isReady) {
      return [];
    }

    return categories
      .filter((category) => {
        const override = selections[category.id];
        const enabled =
          typeof override === "boolean" ? override : category.default_enabled;
        return enabled;
      })
      .map((category) => category.id);
  }, [categories, isReady, selections]);

  const routeKey =
    startHit !== null && destinationHit !== null
      ? `${startHit.id}→${destinationHit.id}`
      : null;

  desiredRouteKeyRef.current = routeKey;

  useEffect(() => {
    if (routeKey === null || startHit === null || destinationHit === null) {
      setRouteFetch({ kind: "unset" });
      return undefined;
    }

    const controller = new AbortController();
    const keyed = routeKey;

    setRouteFetch({ kind: "loading", routeKey: keyed });

    void fetchRoute(
      {
        from: [startHit.lon, startHit.lat],
        to: [destinationHit.lon, destinationHit.lat],
      },
      controller.signal,
    )
      .then((payload) => {
        if (desiredRouteKeyRef.current !== keyed) {
          return;
        }

        setRouteFetch({
          kind: "ok",
          routeKey: keyed,
          line: payload.line,
          summary: payload.summary,
        });

        let line = routeAnnouncementLoaded(
          payload.summary.distanceMeters,
          payload.summary.durationSeconds,
        );

        if (payload.summary.fallbackProfileUsed === true) {
          line = `${line} ${en.routeAnnouncementWheelchairFallback}`;
        }

        announce(line);
      })
      .catch((reason: unknown) => {
        const aborted = reason instanceof DOMException && reason.name === "AbortError";

        const maybeErr = reason as { name?: string | undefined };

        const alsoAbort =
          typeof maybeErr.name === "string" && maybeErr.name === "AbortError";

        if (aborted || alsoAbort) {
          return;
        }

        if (desiredRouteKeyRef.current !== keyed) {
          return;
        }

        setRouteFetch({ kind: "error", routeKey: keyed });
        announce(routeAnnouncementApproxFallback());
      });

    return () => controller.abort();
  }, [announce, destinationHit, routeKey, startHit]);

  const routingUnavailable =
    routeFetch.kind === "error" &&
    routeKey !== null &&
    routeFetch.routeKey === routeKey;

  /**
   * Geometry used to query corridor features. A straight-line approximation is
   * acceptable here even when routing is unavailable: the nearby DC features it
   * surfaces are still real and useful (the user still gets "things between A
   * and B"). This is *not* what we draw on the map.
   */
  const corridorRouteFeature = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => {
    if (startHit === null || destinationHit === null) {
      return DEMO_ROUTE;
    }

    if (
      routeFetch.kind === "ok" &&
      routeFetch.routeKey === routeKey &&
      routeKey !== null
    ) {
      return routeFetch.line;
    }

    return straightLinePreview(startHit, destinationHit);
  }, [destinationHit, routeFetch, routeKey, startHit]);

  /**
   * Line drawn on the map. We never draw a straight crow-flies line: it would
   * imply a walking path that doesn't follow streets. So we draw the frozen
   * sample route on first load, the real route once it resolves, and nothing
   * at all while routing is pending or unavailable (the status strip explains
   * why).
   */
  const mapRoute = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(() => {
    if (startHit === null || destinationHit === null) {
      return DEMO_ROUTE;
    }
    if (
      routeFetch.kind === "ok" &&
      routeFetch.routeKey === routeKey &&
      routeKey !== null
    ) {
      return routeFetch.line;
    }
    return null;
  }, [destinationHit, routeFetch, routeKey, startHit]);

  const summaryModel = useMemo((): Readonly<{
    mode: RouteSummaryMode;
    summary: RouteSummaryPayload | null;
  }> => {
    if (routeKey === null || startHit === null || destinationHit === null) {
      // First-load sample: show the frozen example route's real numbers.
      return { mode: "sample", summary: DEMO_ROUTE_SUMMARY };
    }

    const pending = { mode: "pending" as const, summary: null };

    switch (routeFetch.kind) {
      case "unset":
      case "loading":
        return pending;
      case "error":
        return routeFetch.routeKey === routeKey
          ? { mode: "approx-fallback", summary: null }
          : pending;
      case "ok":
        return routeFetch.routeKey === routeKey
          ? { mode: "live", summary: routeFetch.summary }
          : pending;
    }
  }, [destinationHit, routeFetch, routeKey, startHit]);

  const plannerStatus = useMemo(
    () =>
      derivePlannerStatus({
        summaryMode: summaryModel.mode,
        corridorStatus: corridorListingStatus,
      }),
    [summaryModel.mode, corridorListingStatus],
  );

  function handlePickStart(hit: AddressHit) {
    setStartHit(hit);
    announce("Starting point saved.");
  }

  function handlePickDestination(hit: AddressHit) {
    setDestinationHit(hit);
  }

  useEffect(() => {
    if (!isReady) {
      setCorridorListingStatus("idle");
      return undefined;
    }

    if (enabledCategories.length === 0) {
      setCorridorFeatures([]);
      setCorridorListingStatus("ready");
      return undefined;
    }

    const controller = new AbortController();
    setCorridorListingStatus("loading");

    void fetchCorridorFeatures(
      {
        route_geometry: corridorRouteFeature.geometry,
        buffer_meters: routingUnavailable
          ? CORRIDOR_BUFFER_METERS_FALLBACK
          : CORRIDOR_BUFFER_METERS,
        categories: enabledCategories,
      },
      controller.signal,
    )
      .then((payload) => {
        setCorridorFeatures(payload.features);
        setCorridorListingStatus("ready");
        announce(
          corridorFetchSuccessAnnouncement(payload.features.length, payload.meta),
        );
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setCorridorFeatures([]);
        setCorridorListingStatus("error");
        announce(en.corridorListingFailedBrief);
      });

    return () => controller.abort();
  }, [announce, corridorRouteFeature, enabledCategories, isReady, routingUnavailable]);

  const revealMapForSmallScreens = useCallback(() => {
    if (matchesDesktopMd === true) {
      return;
    }

    setMobileMapOpen(true);
    announce(en.mapShownAnnouncement);
  }, [announce, matchesDesktopMd]);

  const scrollMapIntoComfort = useCallback(() => {
    queueMicrotask(() => {
      const reduceMotion = prefersReducedMotion();
      mapShellRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }, []);

  const handleOpenCorridorRowOnMap = useCallback(
    (id: string): void => {
      setSelectedCorridorFeatureId(id);
      revealMapForSmallScreens();
      scrollMapIntoComfort();
    },
    [revealMapForSmallScreens, scrollMapIntoComfort],
  );

  return (
    <section
      aria-labelledby="scout-plan-heading"
      className="mx-auto max-w-6xl space-y-[var(--space-10)] px-[var(--space-5)] pb-[var(--space-16)] pt-[var(--space-12)]"
    >
      <header className="flex flex-col gap-[var(--space-4)] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div>
          <h1
            id="scout-plan-heading"
            className="text-3xl font-semibold text-[color:var(--color-text)]"
          >
            Plan a route
          </h1>
          <p className="max-w-2xl text-[color:var(--color-text-muted)]">
            Pick a start and a destination. Until you set both points, Scout shows a
            sample route across DC.
          </p>
        </div>
        <ProfilePanel />
      </header>

      <RouteSummary mode={summaryModel.mode} summary={summaryModel.summary} />

      <fieldset
        aria-labelledby="scout-planner-heading"
        id="scout-route-planner"
        className="space-y-[var(--space-8)] border-0 p-0"
      >
        <legend id="scout-planner-heading" className="sr-only">
          Plan a route
        </legend>
        {plannerStatus !== null ? (
          <StatusStrip
            severity={plannerStatus.severity}
            title={plannerStatus.title}
            detail={plannerStatus.detail}
            className="sticky top-0 z-[10] shadow-modal"
          />
        ) : null}
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          showUseMyLocation
          userLocation={userLocation}
          onPick={handlePickStart}
          onUserLocationAcquired={(coords) => setUserLocation([coords[0], coords[1]])}
        />
        <AddressAutocomplete
          id="scout-destination"
          label="Destination"
          userLocation={userLocation}
          onPick={handlePickDestination}
        />
      </fieldset>

      <div className="flex flex-col gap-[var(--space-10)] md:flex-row md:items-start">
        <div className="order-2 min-w-0 flex-1 md:order-1 md:mr-[var(--space-6)]">
          <FeatureListView
            features={corridorFeatures}
            listingStatus={corridorListingStatus}
            selectedFeatureId={selectedCorridorFeatureId}
            onShowOnMap={handleOpenCorridorRowOnMap}
          />
        </div>
        <div
          id="scout-route-map-region"
          data-testid="scout-basemap-region"
          ref={mapShellRef}
          className="order-1 w-full md:order-2 md:max-w-xl md:flex-shrink-0"
        >
          <SkipLink preset="flow" href="#scout-route-list" label="Skip to list" />
          <button
            type="button"
            className="mb-[var(--space-4)] inline-flex min-h-tap w-full items-center justify-center rounded-tokenMd border border-border bg-surface-elevated px-[var(--space-4)] py-[var(--space-3)] text-sm font-semibold text-[color:var(--color-text)] shadow-modal md:hidden focus-visible:btn-accent-double-ring-dark"
            aria-expanded={mobileMapOpen}
            aria-controls="scout-route-map-panel"
            onClick={() => {
              const next = !mobileMapOpen;
              setMobileMapOpen(next);
              if (next) {
                announce(en.mapShownAnnouncement);
              }
            }}
          >
            {mobileMapOpen ? en.hideMapToggle : en.showMapToggle}
          </button>

          <div id="scout-route-map-panel">
            {/* Mobile-first: collapses beneath `md` unless expanded; desktops always render. */}
            <div
              className={`relative w-full md:block ${mobileMapOpen ? "max-md:block" : "max-md:hidden"}`}
            >
              <BasemapView
                corridor={corridorFeatures}
                route={mapRoute}
                viewportHint={
                  routingUnavailable && startHit && destinationHit
                    ? {
                        start: [startHit.lon, startHit.lat],
                        end: [destinationHit.lon, destinationHit.lat],
                      }
                    : null
                }
                selectedFeatureId={selectedCorridorFeatureId}
                onSelectFeature={setSelectedCorridorFeatureId}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
