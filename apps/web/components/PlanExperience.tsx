"use client";

import SkipLink from "@/components/a11y/SkipLink";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import BasemapView from "@/components/BasemapView";
import FeatureListView from "@/components/FeatureListView";
import ProfilePanel from "@/components/ProfilePanel";
import RouteSummary from "@/components/RouteSummary";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";

import { DEMO_ROUTE, demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";

import { fetchCorridorFeatures, type CorridorResponse } from "@/lib/api";

import { formatApproxMeters, roughDistanceMeters } from "@/lib/geo";
import { useProfile } from "@/lib/profile";
import { useEffect, useMemo, useState } from "react";

import type { GeoJSON } from "geojson";

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

export default function PlanExperience() {
  const announce = useAnnounce();
  const { categories, selections, isReady } = useProfile();

  const [anchorA, setAnchorA] = useState<[number, number] | null>(null);
  const [anchorB, setAnchorB] = useState<[number, number] | null>(null);

  const [corridorFeatures, setCorridorFeatures] = useState<
    CorridorResponse["features"]
  >(() => demoCorridorFeatures());

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

  const routeFeature = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => {
    if (anchorA !== null && anchorB !== null) {
      return {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [anchorA, anchorB],
        },
        properties: { source: "dual-picks" },
      };
    }

    return DEMO_ROUTE;
  }, [anchorA, anchorB]);

  const distanceLabelMeters =
    anchorA !== null && anchorB !== null
      ? roughDistanceMeters(anchorA[0], anchorA[1], anchorB[0], anchorB[1])
      : distanceAlongFallbackRoute(DEMO_ROUTE);

  function handleCoordinates(coords: readonly [number, number]) {
    const point: [number, number] = [coords[0], coords[1]];

    if (anchorA === null) {
      setAnchorA(point);
      announce("Start set. Now pick a destination.");
      return;
    }

    if (anchorB === null) {
      setAnchorB(point);
      announce("Destination set. Loading accessibility data near your route.");
      return;
    }

    setAnchorA(point);
    setAnchorB(null);
    announce("Route reset. Now pick a destination.");
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
            Pick a start and a destination. Until you do, Scout shows a sample route
            across DC.
          </p>
        </div>
        <ProfilePanel />
      </header>

      <RouteSummary
        distanceLabel={formatApproxMeters(distanceLabelMeters)}
        warnings={[
          "Approximate distance — Scout's full routing is still in development.",
        ]}
      />

      <AddressAutocomplete onPickCoordinates={handleCoordinates} />

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
