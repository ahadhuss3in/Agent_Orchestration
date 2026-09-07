"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "@/lib/gsap";

/**
 * Pinned sections measure the document once at setup. Web fonts landing
 * after that changes every heading's height, which silently shifts every
 * pin start/end. One refresh once fonts and images have settled fixes it.
 */
export function ScrollRefresh() {
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) ScrollTrigger.refresh();
    };

    if (document.fonts) {
      document.fonts.ready.then(refresh);
    }

    if (document.readyState === "complete") {
      const t = setTimeout(refresh, 60);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    window.addEventListener("load", refresh, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", refresh);
    };
  }, []);

  return null;
}
