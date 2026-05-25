"use client";

import SkipLink from "@/components/a11y/SkipLink";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import BasemapView from "@/components/BasemapView";
import FeatureListView from "@/components/FeatureListView";
import ProfilePanel from "@/components/ProfilePanel";
import RouteSummary, { type RouteSummaryMode } from "@/components/RouteSummary";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";

import { DEMO_ROUTE, demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";

import {
  fetchCorridorFeatures,
  fetchRoute,
  type CorridorResponse,
  type RouteSummaryPayload,
} from "@/lib/api";
import {
  en,
  routeAnnouncementApproxFallback,
  routeAnnouncementLoaded,
} from "@/lib/i18n/messages";

import { roughDistanceMeters } from "@/lib/geo";
import type { AddressHit } from "@/lib/providers/geocoding";
import { useProfile } from "@/lib/profile";

import { useEffect, useMemo, useRef, useState } from "react";

function distanceAlongFallbackRoute(
  route: GeoJSON.Feature<GeoJSON.LineString>,
): number {
  const coords = route.geometry.coordinates;
  if (coords.length < 2) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const head = coords[i];
    const tail = coords[i + 1];
    if (!head || !tail || head.length < 2 || tail.length < 2) {
      continue;
    }

    const lon0 = head[0];
    const lat0 = head[1];
    const lon1 = tail[0];
    const lat1 = tail[1];
    if (
      lon0 === undefined ||
      lat0 === undefined ||
      lon1 === undefined ||
      lat1 === undefined
    ) {
      continue;
    }

    total += roughDistanceMeters(lon0, lat0, lon1, lat1);
  }

  return total;
}

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
  >(() => demoCorridorFeatures());

  const [routeFetch, setRouteFetch] = useState<RouteFetchSlice>({ kind: "unset" });
  /** Ignores stale `fetchRoute` settles when endpoints change faster than upstream responds. */
  const desiredRouteKeyRef = useRef<string | null>(null);

  const demoApproxMeters = useMemo(() => distanceAlongFallbackRoute(DEMO_ROUTE), []);

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

  const straightLineMeters =
    startHit !== null && destinationHit !== null
      ? roughDistanceMeters(
          startHit.lon,
          startHit.lat,
          destinationHit.lon,
          destinationHit.lat,
        )
      : demoApproxMeters;

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

  const routeFeature = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => {
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

  const summaryModel = useMemo((): Readonly<{
    mode: RouteSummaryMode;
    summary: RouteSummaryPayload | null;
    approxMeters: number;
  }> => {
    if (routeKey === null || startHit === null || destinationHit === null) {
      return {
        mode: "sample",
        summary: null,
        approxMeters: demoApproxMeters,
      };
    }

    const mismatchedSlice =
      (routeFetch.kind === "loading" ||
        routeFetch.kind === "ok" ||
        routeFetch.kind === "error") &&
      routeFetch.routeKey !== routeKey;

    if (routeFetch.kind === "loading" && routeFetch.routeKey === routeKey) {
      return {
        mode: "pending",
        summary: null,
        approxMeters: straightLineMeters,
      };
    }

    if (routeFetch.kind === "unset") {
      return {
        mode: "pending",
        summary: null,
        approxMeters: straightLineMeters,
      };
    }

    if (mismatchedSlice) {
      return {
        mode: "pending",
        summary: null,
        approxMeters: straightLineMeters,
      };
    }

    if (routeFetch.kind === "error") {
      return {
        mode: "approx-fallback",
        summary: null,
        approxMeters: straightLineMeters,
      };
    }

    if (routeFetch.kind === "ok") {
      return {
        mode: "live",
        summary: routeFetch.summary,
        approxMeters: routeFetch.summary.distanceMeters,
      };
    }
  }, [
    demoApproxMeters,
    destinationHit,
    routeFetch,
    routeKey,
    startHit,
    straightLineMeters,
  ]);

  function handlePickStart(hit: AddressHit) {
    setStartHit(hit);
    announce("Starting point saved.");
  }

  function handlePickDestination(hit: AddressHit) {
    setDestinationHit(hit);
  }

  useEffect(() => {
    if (!isReady || enabledCategories.length === 0) {
      return;
    }

    const controller = new AbortController();

    void fetchCorridorFeatures(
      {
        route_geometry: routeFeature.geometry,
        buffer_meters: 30,
        categories: enabledCategories,
      },
      controller.signal,
    )
      .then((payload) => {
        setCorridorFeatures(payload.features);
        announce(
          `Found ${String(payload.features.length)} accessibility features along your route.`,
        );
      })
      .catch(() => {
        setCorridorFeatures(demoCorridorFeatures());
        announce("Couldn't load the latest features. Showing a sample instead.");
      });

    return () => controller.abort();
  }, [announce, enabledCategories, isReady, routeFeature]);

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
            Plan a walking route
          </h1>
          <p className="max-w-2xl text-[color:var(--color-text-muted)]">
            Pick a start and a destination. Until you set both points, Scout shows a
            sample route across DC.
          </p>
        </div>
        <ProfilePanel />
      </header>

      <RouteSummary
        mode={summaryModel.mode}
        summary={summaryModel.summary}
        approximateDistanceMeters={summaryModel.approxMeters}
      />

      <fieldset
        aria-labelledby="scout-planner-heading"
        id="scout-route-planner"
        className="space-y-[var(--space-8)] border-0 p-0"
      >
        <legend id="scout-planner-heading" className="sr-only">
          Plan a route
        </legend>
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

      <div className="flex flex-col gap-[var(--space-10)] xl:flex-row-reverse xl:items-start">
        <div className="relative w-full xl:max-w-xl">
          <SkipLink preset="flow" href="#scout-route-list" label="Skip map" />
          <BasemapView corridor={corridorFeatures} route={routeFeature} />
        </div>
        <div className="flex-1">
          <FeatureListView route={routeFeature} features={corridorFeatures} />
        </div>
      </div>
    </section>
  );
}
