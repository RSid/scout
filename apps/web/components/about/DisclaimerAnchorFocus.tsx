"use client";

import { useEffect } from "react";

/** Move focus into the anchored disclaimer heading after client navigation (#disclaimer). */
export default function DisclaimerAnchorFocus() {
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#disclaimer") {
      return;
    }

    window.requestAnimationFrame(() => {
      const node = document.getElementById("disclaimer-heading");
      if (!(node instanceof HTMLElement)) {
        return;
      }

      node.focus({ preventScroll: false });
      node.scrollIntoView({ block: "start" });
    });
  }, []);

  return null;
}
