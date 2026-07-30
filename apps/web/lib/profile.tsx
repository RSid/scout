"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ApiCategory } from "@/lib/api";
import { fetchCategories } from "@/lib/api";

export const PROFILE_STORAGE_KEY = "scout.profile.v1";

type PersistedPreferences = Readonly<{
  version: 1;
  selections: Record<string, boolean>;
}>;

type ProfileContextValue = Readonly<{
  categories: readonly ApiCategory[];
  selections: Record<string, boolean | undefined>;
  toggle: (id: string, value: boolean) => void;
  resetToDefaults: () => void;
  persist: () => void;
  refreshRemote: () => Promise<void>;
  isReady: boolean;
  /** True when localStorage can't be written (private mode / quota): we keep
   * working from in-memory defaults but warn the user nothing will be saved. */
  storageBlocked: boolean;
}>;

const ProfileContext = createContext<ProfileContextValue | null>(null);

function localStorageWritable(): boolean {
  if (typeof window === "undefined") {
    return true; // SSR: assume available; the client re-checks after hydration.
  }
  try {
    const probe = "scout.profile.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readSelections(): PersistedPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedPreferences;
    return parsed.version === 1 &&
      parsed.selections &&
      typeof parsed.selections === "object"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function mergeDefaults(
  categories: readonly ApiCategory[],
  persisted: PersistedPreferences | null,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  categories.forEach((cat) => {
    const persistedValue =
      persisted &&
      persisted.selections &&
      Object.prototype.hasOwnProperty.call(persisted.selections, cat.id)
        ? persisted.selections[cat.id]
        : undefined;

    next[cat.id] =
      typeof persistedValue === "boolean" ? persistedValue : cat.default_enabled;
  });
  return next;
}

export function ProfileProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  const hydrateFromCategories = useCallback(async () => {
    const remote = await fetchCategories();

    const stored = typeof window !== "undefined" ? readSelections() : null;
    const merged = mergeDefaults(
      remote.length > 0 ? remote : SAMPLE_CATEGORIES_FALLBACK,
      stored,
    );

    setCategories(remote.length > 0 ? remote : [...SAMPLE_CATEGORIES_FALLBACK]);
    setSelections(merged);
    setStorageBlocked(!localStorageWritable());
    setReady(true);
  }, []);

  useEffect(() => {
    hydrateFromCategories().catch(() => {
      const stored = typeof window !== "undefined" ? readSelections() : null;
      const fallback = SAMPLE_CATEGORIES_FALLBACK;
      setSelections(mergeDefaults(fallback, stored));
      setCategories([...fallback]);
      setStorageBlocked(!localStorageWritable());
      setReady(true);
    });
  }, [hydrateFromCategories]);

  const toggle = useCallback((id: string, value: boolean) => {
    setSelections((prev) => ({
      ...prev,
      [id]: value,
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSelections(
      mergeDefaults(
        categories.length > 0 ? categories : SAMPLE_CATEGORIES_FALLBACK,
        null,
      ),
    );
  }, [categories]);

  const persist = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedPreferences = { version: 1, selections: { ...selections } };
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(payload));
      setStorageBlocked(false);
    } catch {
      // Private mode / quota: keep the in-memory selections working and let the
      // panel surface the "won't be saved on this device" notice.
      setStorageBlocked(true);
    }
  }, [selections]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      categories,
      selections,
      toggle,
      resetToDefaults,
      persist,
      refreshRemote: hydrateFromCategories,
      isReady: ready,
      storageBlocked,
    }),
    [
      categories,
      selections,
      toggle,
      resetToDefaults,
      persist,
      hydrateFromCategories,
      ready,
      storageBlocked,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used inside ProfileProvider");
  }
  return ctx;
}

/**
 * Bundled mirror of the backend `/api/categories` manifest
 * (`apps/backend/scout/data/categories.py`). Used only when the endpoint is
 * unreachable so the panel still offers the full M1 category set rather than a
 * single-row stub. Keep in sync with the backend if the canonical list changes.
 */
export const SAMPLE_CATEGORIES_FALLBACK: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "DC ADA curb ramps; obstacles when non-compliant or missing.",
    kind: "obstacle",
    default_enabled: true,
  },
  {
    id: "barriers",
    label: "Sidewalk barriers",
    description: "Trip hazards and missing sidewalk spans.",
    kind: "obstacle",
    default_enabled: true,
  },
  {
    id: "audible_signals",
    label: "Audible pedestrian signals",
    description: "Presence or absence of audible crossing signals.",
    kind: "aid",
    default_enabled: true,
  },
  {
    id: "bus_stops",
    label: "Accessible bus stops",
    description: "Metrobus ADA stop inventory (mostly M2).",
    kind: "aid",
    default_enabled: false,
  },
  {
    id: "restrooms",
    label: "Accessible restrooms",
    description: "Community restroom data layered from Refuge Restrooms.",
    kind: "aid",
    default_enabled: true,
  },
  {
    id: "rest_spots",
    label: "Rest / seating spots",
    description: "Benches mapped from auxiliary sources.",
    kind: "aid",
    default_enabled: true,
  },
  {
    id: "water_cooling",
    label: "Water / cooling spots",
    description: "Drinking fountains and related aids.",
    kind: "aid",
    default_enabled: true,
  },
  {
    id: "driveways",
    label: "Driveway crossings",
    description: "Minor curb transitions (opt-in category).",
    kind: "obstacle",
    default_enabled: false,
  },
  {
    id: "median_cut_throughs",
    label: "Median cut-throughs",
    description: "Pedestrian refuges crossing medians.",
    kind: "aid",
    default_enabled: false,
  },
];
