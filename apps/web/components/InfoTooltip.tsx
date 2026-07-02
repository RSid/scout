"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type InfoTooltipProps = {
  label: string;
  children: ReactNode;
};

const MAX_PANEL_WIDTH = 256;
const VIEWPORT_MARGIN = 16;

export default function InfoTooltip({ label, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) {
      setPanelStyle(null);
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(MAX_PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    setPanelStyle({ top: rect.bottom + 8, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onDismiss() {
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-full text-[color:var(--color-warning-text)] focus-visible:btn-accent-double-ring-dark"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16Zm.75-11.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0ZM9 9a.75.75 0 000 1.5h.25v3.25a.75.75 0 001.5 0V9.75A.75.75 0 0010 9H9Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="tooltip"
              style={{
                top: panelStyle.top,
                left: panelStyle.left,
                width: panelStyle.width,
                zIndex: "calc(var(--z-modal) + 1)",
              }}
              className="fixed rounded-tokenMd bg-[color:var(--color-warning-surface)] p-[var(--space-4)] text-sm text-[color:var(--color-warning-text)] shadow-modal"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
