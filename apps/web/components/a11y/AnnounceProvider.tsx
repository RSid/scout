"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import LiveRegion from "./LiveRegion";

type AnnounceDispatch = (message: string) => void;

const AnnounceContext = createContext<AnnounceDispatch>(() => {});

export function useAnnounce(): AnnounceDispatch {
  return useContext(AnnounceContext);
}

export function AnnounceProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);

  const announce = useCallback((payload: string) => {
    const trimmed = payload.trim();

    if (trimmed.length === 0) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    window.clearTimeout(timer.current);

    /**
     * React Aria dialogs clear live regions asynchronously; resetting with a noop
     * tick keeps TalkBack + VoiceOver reliably narrating repeats.
     */
    setMessage("");

    window.requestAnimationFrame(() => {
      setMessage(trimmed);
      timer.current = window.setTimeout(() => {
        setMessage("");
      }, 4000);
    });
  }, []);

  const value = useMemo(() => announce, [announce]);

  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <LiveRegion message={message} />
    </AnnounceContext.Provider>
  );
}
