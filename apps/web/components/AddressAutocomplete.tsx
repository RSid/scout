"use client";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import { ScoutApiError } from "@/lib/api";
import { formatApproxMeters, roughDistanceMeters } from "@/lib/geo";
import {
  requestLimitMessages,
  retryWhenPhrase,
  withRetryWhen,
} from "@/lib/i18n/messages";
import type { AddressHit, GeocodingProvider } from "@/lib/providers/geocoding";
import { getGeocodingProvider } from "@/lib/providers/geocoding";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";

const DEBOUNCE_MS = 500;
/** Pause after a 429 that carries no usable `Retry-After`. */
const RATE_LIMIT_DEFAULT_PAUSE_SECONDS = 10;
/** Longest pause honored, so a bad header can't disable search for the session. */
const RATE_LIMIT_MAX_PAUSE_SECONDS = 60;

function isRateLimited(error: unknown): error is ScoutApiError {
  return (
    error instanceof ScoutApiError &&
    (error.code === "RATE_LIMIT" || error.status === 429)
  );
}

type LocationStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "error"; message: string };

type SuggestionItem = AddressHit & { suggestionText: string };

function buildSuggestionText(
  hit: AddressHit,
  userLocation: readonly [number, number] | null | undefined,
): string {
  if (!userLocation) {
    return hit.label;
  }
  const meters = roughDistanceMeters(
    userLocation[0],
    userLocation[1],
    hit.lon,
    hit.lat,
  );
  return `${hit.label} · ${formatApproxMeters(meters)}`;
}

function toSuggestionItems(
  hits: readonly AddressHit[],
  userLocation: readonly [number, number] | null | undefined,
): readonly SuggestionItem[] {
  return hits.map((hit) => ({
    ...hit,
    suggestionText: buildSuggestionText(hit, userLocation),
  }));
}

export type AddressAutocompleteProps = Readonly<{
  id: string;
  label: string;
  showUseMyLocation?: boolean | undefined;
  userLocation?: readonly [number, number] | null | undefined;
  onPick: (hit: AddressHit) => void;
  onUserLocationAcquired?: ((coords: readonly [number, number]) => void) | undefined;
  provider?: GeocodingProvider | undefined;
  /** Text shown before the user types, e.g. the sample route's address. Not geocoded. */
  initialValue?: string | undefined;
}>;

export default function AddressAutocomplete({
  id,
  label,
  showUseMyLocation = false,
  userLocation,
  onPick,
  onUserLocationAcquired,
  provider: providerProp,
  initialValue = "",
}: AddressAutocompleteProps) {
  const announce = useAnnounce();
  const provider = useMemo(
    () => providerProp ?? getGeocodingProvider(),
    [providerProp],
  );
  const debounceTimer = useRef<number | undefined>(undefined);
  const abortController = useRef<AbortController | undefined>(undefined);
  /**
   * Input text that names an address the user already chose (a picked
   * suggestion or a reverse-geocoded location). Searching for it again would
   * only repeat the lookup, so the search effect skips these values.
   */
  const committedText = useRef<ReadonlySet<string>>(new Set());
  /**
   * A pre-filled `initialValue` is already a chosen address, so don't geocode it
   * until the user edits the field. A ref (not a one-shot flag consumed by the
   * effect) so React's dev-mode double effect run can't trigger a search either.
   */
  const userHasEdited = useRef(false);
  /** While in the future, searches wait instead of hitting the rate limit again. */
  const searchPausedUntilMs = useRef(0);
  const [inputValue, setInputValue] = useState(initialValue);
  const [hits, setHits] = useState<readonly AddressHit[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * True only after a geocode returned zero matches for the current query,
   * so the "DC addresses only" hint stays quiet when hits are empty for any
   * other reason (initial state, a pick that cleared hits, or an in-flight
   * search).
   */
  const [noMatchesForCurrentQuery, setNoMatchesForCurrentQuery] = useState(false);
  /** Shown after a 429 until the next search gets an answer. */
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>({
    kind: "idle",
  });

  const suggestionItems = useMemo(
    () => toSuggestionItems(hits, userLocation),
    [hits, userLocation],
  );

  /** Drops any queued or in-flight search so its results can't land late. */
  const cancelPendingSearch = useCallback(() => {
    window.clearTimeout(debounceTimer.current);
    abortController.current?.abort();
    abortController.current = undefined;
  }, []);

  const runGeocode = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      abortController.current?.abort();
      abortController.current = undefined;

      if (trimmed.length < 3) {
        setHits([]);
        setBusy(false);
        return;
      }

      const controller = new AbortController();
      abortController.current = controller;
      setBusy(true);

      try {
        const nextHits = await provider.search(
          trimmed,
          { limit: 5 },
          controller.signal,
        );
        // A provider may ignore the signal; never show results for an old query.
        if (controller.signal.aborted) {
          return;
        }
        const nextArray = [...nextHits];
        setRateLimitMessage(null);
        setHits(nextArray);
        setNoMatchesForCurrentQuery(nextArray.length === 0);

        announce(
          nextArray.length === 0
            ? "No suggestions"
            : `${String(nextArray.length)} ${nextArray.length === 1 ? "suggestion" : "suggestions"}`,
        );
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        if (isRateLimited(error)) {
          const pauseSeconds = Math.min(
            error.retryAfterSeconds ?? RATE_LIMIT_DEFAULT_PAUSE_SECONDS,
            RATE_LIMIT_MAX_PAUSE_SECONDS,
          );
          searchPausedUntilMs.current = Date.now() + pauseSeconds * 1000;
          const message = withRetryWhen(
            requestLimitMessages.geocodeRateLimitedTemplate,
            retryWhenPhrase(pauseSeconds),
          );
          setRateLimitMessage(message);
          announce(message);
          setHits([]);
          // Try this query once more when the pause ends. A new keystroke
          // replaces this timer with one for the newer text.
          window.clearTimeout(debounceTimer.current);
          debounceTimer.current = window.setTimeout(() => {
            void runGeocode(query);
          }, pauseSeconds * 1000);
          return;
        }

        const fallback =
          error instanceof ScoutApiError
            ? error.message
            : "Address search isn't responding — try a shorter query.";
        announce(fallback);
        setHits([]);
      } finally {
        // Only the newest request owns the spinner; an aborted one must not
        // hide "Searching…" while its replacement is still in flight.
        if (abortController.current === controller) {
          abortController.current = undefined;
          setBusy(false);
        }
      }
    },
    [announce, provider],
  );

  useEffect(() => {
    if (committedText.current.has(inputValue)) {
      // A selection (pick or reverse-geocode) just committed this value, either
      // as the suggestion text the combobox writes or the plain label we write
      // after it. Cancel any search queued by earlier keystrokes, and clear
      // "Searching…" and the "no matches" hint: a picked value is a match.
      cancelPendingSearch();
      setBusy(false);
      setNoMatchesForCurrentQuery(false);
      return undefined;
    }
    committedText.current = new Set();
    if (!userHasEdited.current) {
      return undefined;
    }
    // A new keystroke starts fresh — the hint should only reappear once a
    // fresh geocode round-trip confirms zero matches. Abort the in-flight
    // request too, so its results can't flash in after this keystroke.
    setNoMatchesForCurrentQuery(false);
    cancelPendingSearch();
    const trimmed = inputValue.trim();
    // After a 429, wait out the pause; the rate-limit message stands in for
    // "Searching…" until then.
    const pauseLeftMs = searchPausedUntilMs.current - Date.now();
    setBusy(trimmed.length >= 3 && pauseLeftMs <= 0);
    debounceTimer.current = window.setTimeout(
      () => {
        void runGeocode(inputValue);
      },
      Math.max(DEBOUNCE_MS, pauseLeftMs),
    );

    return () => window.clearTimeout(debounceTimer.current);
  }, [cancelPendingSearch, inputValue, runGeocode]);

  const trimmedForHint = inputValue.trim();

  return (
    <ComboBox
      id={id}
      allowsCustomValue
      aria-label={label}
      items={suggestionItems}
      inputValue={inputValue}
      onInputChange={(value) => {
        userHasEdited.current = true;
        setInputValue(value);
      }}
      className="space-y-[var(--space-3)] text-[color:var(--color-text)]"
      onSelectionChange={(key) => {
        if (key == null) {
          return;
        }
        const match = suggestionItems.find((item) => String(item.id) === String(key));
        if (!match) {
          return;
        }

        onPick(match);
        announce(`Selected ${match.suggestionText}`);
        setHits([]);
        committedText.current = new Set([match.label, match.suggestionText]);
        cancelPendingSearch();
        setBusy(false);
        window.setTimeout(() => {
          setInputValue(match.label);
        });
      }}
    >
      <Label className="block font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-[var(--space-3)]">
        <Input
          className="min-h-tap min-w-0 flex-1 rounded-tokenMd border border-border bg-[color:var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] outline-none focus-visible:btn-accent-double-ring-dark"
          placeholder="Type an address or place name (at least 3 letters)"
        />
        <Button
          aria-label="Show suggestions"
          className="min-h-tap min-w-tap shrink-0 rounded-tokenMd border border-border px-[var(--space-5)]"
        >
          ⌄
        </Button>
      </div>
      <Popover className="max-h-[16rem] w-full rounded-tokenMd border border-border bg-[color:var(--color-surface-elevated)] shadow-modal">
        <Text slot="description" className="sr-only">
          Pick an address for {label}.
        </Text>
        <ListBox className="max-h-[220px]">
          {(item: SuggestionItem) => (
            <ListBoxItem
              id={item.id}
              textValue={item.suggestionText}
              className="flex min-h-tap cursor-pointer items-center px-[var(--space-3)] py-[var(--space-3)] hover:bg-[color:var(--color-surface)]"
            >
              {item.suggestionText}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      {rateLimitMessage !== null ? (
        // Announced through the shared live region when it first appears.
        <p className="text-sm text-[color:var(--color-text)]">{rateLimitMessage}</p>
      ) : null}
      {trimmedForHint.length >= 3 &&
      !busy &&
      noMatchesForCurrentQuery &&
      rateLimitMessage === null ? (
        <p className="text-sm text-[color:var(--color-text-muted)]" aria-live="polite">
          We currently support Washington, DC addresses and named places only.
        </p>
      ) : null}
      {showUseMyLocation ? (
        <div className="flex flex-wrap items-center gap-[var(--space-4)]">
          <button
            type="button"
            aria-label={`Use my location for ${label}`}
            disabled={locationStatus.kind === "locating"}
            className="inline-flex min-h-tap rounded-tokenMd border border-border px-[var(--space-6)] py-[var(--space-4)] focus-visible:btn-accent-double-ring-dark disabled:opacity-60"
            onClick={() => {
              if (typeof navigator.geolocation === "undefined") {
                const message = "Your browser doesn't support location.";
                setLocationStatus({ kind: "error", message });
                announce(message);
                return;
              }

              if (typeof window !== "undefined" && window.isSecureContext === false) {
                const message =
                  "Location requires a secure connection — try opening this page over HTTPS (or localhost).";
                setLocationStatus({ kind: "error", message });
                announce(message);
                return;
              }

              setLocationStatus({ kind: "locating" });

              navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                  void (async () => {
                    try {
                      const hit = await provider.reverse(
                        coords.longitude,
                        coords.latitude,
                      );
                      onPick(hit);
                      onUserLocationAcquired?.([coords.longitude, coords.latitude]);
                      setLocationStatus({ kind: "idle" });
                      announce(hit.label);
                      committedText.current = new Set([hit.label]);
                      cancelPendingSearch();
                      setBusy(false);
                      setInputValue(hit.label);
                      setHits([]);
                    } catch (error: unknown) {
                      const message =
                        error instanceof ScoutApiError
                          ? error.message
                          : "Couldn't translate that location — try typing an address instead.";
                      setLocationStatus({ kind: "error", message });
                      announce(message);
                    }
                  })();
                },
                (error) => {
                  const message =
                    error.code === error.PERMISSION_DENIED
                      ? "Location access is blocked for this site. Allow it in your browser's site settings, then try again."
                      : error.code === error.POSITION_UNAVAILABLE
                        ? "Your device couldn't determine its location. Try again or type an address."
                        : "Location took too long to respond. Try again.";
                  setLocationStatus({ kind: "error", message });
                  announce(message);
                },
              );
            }}
          >
            Use my location
          </button>
          {locationStatus.kind === "locating" ? (
            <p
              className="text-sm text-[color:var(--color-text-muted)]"
              aria-hidden="true"
            >
              Locating your position…
            </p>
          ) : locationStatus.kind === "error" ? (
            <p
              className="text-sm text-[color:var(--color-danger-text)]"
              aria-hidden="true"
            >
              {locationStatus.message}
            </p>
          ) : busy ? (
            <p
              className="text-sm text-[color:var(--color-text-muted)]"
              aria-hidden="true"
            >
              Searching…
            </p>
          ) : null}
        </div>
      ) : busy ? (
        <p className="text-sm text-[color:var(--color-text-muted)]" aria-hidden="true">
          Searching…
        </p>
      ) : null}
    </ComboBox>
  );
}
