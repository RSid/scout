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
}>;

const ProfileContext = createContext<ProfileContextValue | null>(null);

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

  const hydrateFromCategories = useCallback(async () => {
    const remote = await fetchCategories();

    const stored = typeof window !== "undefined" ? readSelections() : null;
    const merged = mergeDefaults(
      remote.length > 0 ? remote : SAMPLE_CATEGORIES_FALLBACK,
      stored,
    );

    setCategories(remote.length > 0 ? remote : [...SAMPLE_CATEGORIES_FALLBACK]);
    setSelections(merged);
    setReady(true);
  }, []);

  useEffect(() => {
    hydrateFromCategories().catch(() => {
      const stored = typeof window !== "undefined" ? readSelections() : null;
      const fallback = SAMPLE_CATEGORIES_FALLBACK;
      setSelections(mergeDefaults(fallback, stored));
      setCategories([...fallback]);
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
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(payload));
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
    }),
    [
      categories,
      selections,
      toggle,
      resetToDefaults,
      persist,
      hydrateFromCategories,
      ready,
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

const SAMPLE_CATEGORIES_FALLBACK: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "Pedestrian curb ramps and transitions.",
    kind: "obstacle",
    default_enabled: true,
  },
];
