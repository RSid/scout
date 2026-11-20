"use client";

import SkipLink from "@/components/a11y/SkipLink";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import BasemapView from "@/components/BasemapView";
import FeatureListView from "@/components/FeatureListView";
import ProfilePanel from "@/components/ProfilePanel";
import RouteSummary, { type RouteSummaryMode } from "@/components/RouteSummary";
import StatusStrip from "@/components/StatusStrip";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";

import {
  DEMO_DESTINATION_HIT,
  DEMO_ROUTE,
  DEMO_ROUTE_SUMMARY,
  DEMO_START_HIT,
} from "@/lib/fixtures/route-plan-fixtures";
import {
  corridorFailureAnnouncement,
  derivePlannerStatus,
  requestFailureFrom,
  routeFailureAnnouncement,
  type RequestFailure,
} from "@/lib/planner-status";

import {
  CORRIDOR_BUFFER_METERS,
  CORRIDOR_BUFFER_METERS_FALLBACK,
  fetchCorridorFeatures,
  fetchRoute,
  ScoutApiError,
  type CorridorResponse,
  type RouteSummaryPayload,
} from "@/lib/api";
import {
  corridorFetchSuccessAnnouncement,
  en,
  retryWhenPhrase,
  routeAnnouncementLoaded,
} from "@/lib/i18n/messages";

import type { CorridorListingStatus } from "@/components/FeatureListView";

import type { AddressHit } from "@/lib/providers/geocoding";
import { prefersReducedMotion } from "@/lib/a11y";
import { SAMPLE_CATEGORIES_FALLBACK, useProfile } from "@/lib/profile";

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

type CorridorRequest = Readonly<{
  /** Identifies a distinct (geometry, buffer, categories) query. */
  key: string;
  geometry: GeoJSON.LineString;
  bufferMeters: number;
  categories: readonly string[];
}>;

type RouteFetchSlice =
  | { kind: "unset" }
  | { kind: "loading"; routeKey: string }
  | {
      kind: "ok";
      routeKey: string;
      line: GeoJSON.Feature<GeoJSON.LineString>;
      summary: RouteSummaryPayload;
    }
  | { kind: "error"; routeKey: string; failure: RequestFailure };

/** Backend codes whose `Retry-After` means "don't ask again until then". */
const ROUTE_COOLDOWN_CODES: ReadonlySet<string> = new Set([
  "ROUTE_SERVICE_BUSY",
  "RATE_LIMIT",
]);

export default function PlanExperience() {
  const announce = useAnnounce();
  const { categories, selections, isReady: profileReady } = useProfile();

  // Start on the sample route's endpoints so first-time visitors see a worked example.
  const [startHit, setStartHit] = useState<AddressHit>(DEMO_START_HIT);
  const [destinationHit, setDestinationHit] =
    useState<AddressHit>(DEMO_DESTINATION_HIT);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const [corridorFeatures, setCorridorFeatures] = useState<
    CorridorResponse["features"]
  >(() => []);

  const [routeFetch, setRouteFetch] = useState<RouteFetchSlice>({ kind: "unset" });
  /** Ignores stale `fetchRoute` settles when endpoints change faster than upstream responds. */
  const desiredRouteKeyRef = useRef<string | null>(null);
  /**
   * Set when routing answers busy (503) or rate-limited (429) with a
   * `Retry-After`. Until it passes, new routes show that state without a
   * request: the backend would only refuse again, and each refusal still
   * counts against this device's limit.
   */
  const routeCooldownRef = useRef<Readonly<{ untilMs: number; code: string }> | null>(
    null,
  );

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
  /** Why the last corridor query failed; read only while the status is `error`. */
  const [corridorFailure, setCorridorFailure] = useState<RequestFailure | undefined>(
    undefined,
  );

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
    const cats = categories.length > 0 ? categories : SAMPLE_CATEGORIES_FALLBACK;
    return cats
      .filter((category) => {
        const override = selections[category.id];
        const enabled =
          typeof override === "boolean" ? override : category.default_enabled;
        return enabled;
      })
      .map((category) => category.id);
  }, [categories, selections]);

  /**
   * While both endpoints are still the sample's, show the frozen sample route
   * instead of asking the routing provider for it on every page load.
   */
  const showingSampleRoute =
    startHit.id === DEMO_START_HIT.id && destinationHit.id === DEMO_DESTINATION_HIT.id;

  const routeKey = showingSampleRoute ? null : `${startHit.id}→${destinationHit.id}`;

  desiredRouteKeyRef.current = routeKey;

  useEffect(() => {
    if (routeKey === null) {
      setRouteFetch({ kind: "unset" });
      return undefined;
    }

    const keyed = routeKey;

    const cooldown = routeCooldownRef.current;
    if (cooldown !== null && Date.now() < cooldown.untilMs) {
      const failure: RequestFailure = {
        code: cooldown.code,
        retryWhen: retryWhenPhrase((cooldown.untilMs - Date.now()) / 1000),
      };
      setRouteFetch({ kind: "error", routeKey: keyed, failure });
      announce(routeFailureAnnouncement(failure));
      return undefined;
    }

    const controller = new AbortController();
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

        const failure = requestFailureFrom(reason);
        if (
          reason instanceof ScoutApiError &&
          reason.code !== undefined &&
          ROUTE_COOLDOWN_CODES.has(reason.code) &&
          reason.retryAfterSeconds !== undefined
        ) {
          routeCooldownRef.current = {
            untilMs: Date.now() + reason.retryAfterSeconds * 1000,
            code: reason.code,
          };
        }

        setRouteFetch({ kind: "error", routeKey: keyed, failure });
        announce(routeFailureAnnouncement(failure));
      });

    return () => controller.abort();
  }, [announce, destinationHit, routeKey, startHit]);

  const routingUnavailable =
    routeFetch.kind === "error" &&
    routeKey !== null &&
    routeFetch.routeKey === routeKey;

  /**
   * The single corridor request the planner wants right now, or `null` while
   * there is nothing worth asking for yet. Each distinct request is sent once:
   * the effect below re-runs only when `key` changes, never on a fresh array or
   * object identity.
   *
   * - Waits for the profile's categories, so page load doesn't query once with
   *   the bundled fallback list and again when `/api/categories` answers.
   * - Skips the straight-line preview while a real route is in flight. That
   *   query would be thrown away a few seconds later, and its 30 m corridor
   *   around a crow-flies line lists things that aren't on the actual route.
   * - When routing fails, queries a wide corridor around the straight line:
   *   the nearby DC features it surfaces are still real and useful ("things
   *   between A and B"). That line is never drawn on the map.
   */
  const corridorRequest = useMemo((): CorridorRequest | null => {
    if (!profileReady) {
      return null;
    }

    let geometryKey: string;
    let geometry: GeoJSON.LineString;
    if (routeKey === null) {
      geometryKey = "sample";
      geometry = DEMO_ROUTE.geometry;
    } else if (routeFetch.kind === "ok" && routeFetch.routeKey === routeKey) {
      geometryKey = `route:${routeKey}`;
      geometry = routeFetch.line.geometry;
    } else if (routingUnavailable) {
      geometryKey = `straight:${routeKey}`;
      geometry = straightLinePreview(startHit, destinationHit).geometry;
    } else {
      return null;
    }

    const bufferMeters = routingUnavailable
      ? CORRIDOR_BUFFER_METERS_FALLBACK
      : CORRIDOR_BUFFER_METERS;
    const sortedCategories = [...enabledCategories].sort();

    return {
      key: `${geometryKey}|${String(bufferMeters)}|${sortedCategories.join(",")}`,
      geometry,
      bufferMeters,
      categories: sortedCategories,
    };
  }, [
    destinationHit,
    enabledCategories,
    profileReady,
    routeFetch,
    routeKey,
    routingUnavailable,
    startHit,
  ]);

  /** Lets the corridor effect read the latest request while keying only on `key`. */
  const corridorRequestRef = useRef<CorridorRequest | null>(corridorRequest);
  corridorRequestRef.current = corridorRequest;
  const corridorRequestKey = corridorRequest?.key ?? null;

  /**
   * Line drawn on the map. We never draw a straight crow-flies line: it would
   * imply a walking path that doesn't follow streets. So we draw the frozen
   * sample route on first load, the real route once it resolves, and nothing
   * at all while routing is pending or unavailable (the status strip explains
   * why).
   */
  const mapRoute = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(() => {
    if (routeKey === null) {
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
  }, [routeFetch, routeKey]);

  const summaryModel = useMemo((): Readonly<{
    mode: RouteSummaryMode;
    summary: RouteSummaryPayload | null;
  }> => {
    if (routeKey === null) {
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
  }, [routeFetch, routeKey]);

  const plannerStatus = useMemo(
    () =>
      derivePlannerStatus({
        summaryMode: summaryModel.mode,
        corridorStatus: corridorListingStatus,
        routeFailure: routeFetch.kind === "error" ? routeFetch.failure : undefined,
        corridorFailure,
      }),
    [summaryModel.mode, corridorListingStatus, routeFetch, corridorFailure],
  );

  function handlePickStart(hit: AddressHit) {
    setStartHit(hit);
    announce("Starting point saved.");
  }

  function handlePickDestination(hit: AddressHit) {
    setDestinationHit(hit);
  }

  useEffect(() => {
    const request = corridorRequestRef.current;

    if (request === null) {
      // Profile still loading (list stays idle), or a real route is in flight:
      // clear the previous route's items rather than list them against the
      // new endpoints.
      if (profileReady) {
        setCorridorFeatures([]);
        setCorridorListingStatus("loading");
      }
      return undefined;
    }

    if (request.categories.length === 0) {
      setCorridorFeatures([]);
      setCorridorListingStatus("ready");
      return undefined;
    }

    const controller = new AbortController();
    setCorridorListingStatus("loading");

    void fetchCorridorFeatures(
      {
        route_geometry: request.geometry,
        buffer_meters: request.bufferMeters,
        categories: request.categories,
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
        const failure = requestFailureFrom(reason);
        setCorridorFeatures([]);
        setCorridorFailure(failure);
        setCorridorListingStatus("error");
        announce(corridorFailureAnnouncement(failure));
      });

    return () => controller.abort();
    // `corridorRequestKey` stands in for the request it names (see `corridorRequest`).
  }, [announce, corridorRequestKey, profileReady]);

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
            Pick a start and a destination. To show how it works, Scout starts with a
            sample route across DC.
          </p>
        </div>
        <ProfilePanel />
      </header>

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
        {/* Side by side from `md` up; the planner treats ≥768px as desktop. */}
        <div className="grid grid-cols-1 gap-[var(--space-8)] md:grid-cols-2 md:items-start md:gap-[var(--space-6)]">
          <AddressAutocomplete
            id="scout-start"
            label="Starting point"
            initialValue={DEMO_START_HIT.label}
            showUseMyLocation
            userLocation={userLocation}
            onPick={handlePickStart}
            onUserLocationAcquired={(coords) => setUserLocation([coords[0], coords[1]])}
          />
          <AddressAutocomplete
            id="scout-destination"
            label="Destination"
            initialValue={DEMO_DESTINATION_HIT.label}
            userLocation={userLocation}
            onPick={handlePickDestination}
          />
        </div>
      </fieldset>

      <RouteSummary mode={summaryModel.mode} summary={summaryModel.summary} />

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
                  routingUnavailable
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
