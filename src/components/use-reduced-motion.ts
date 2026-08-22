"use client";

import { useEffect, useState } from "react";

/**
 * True when motion should be suppressed, for either of two reasons:
 *
 *   - the visitor set reduced motion at the operating system level, or
 *   - they turned the app's own reduce-motion setting on.
 *
 * Both matter. The CSS in globals.css neutralises declarative animation for
 * both cases, but JavaScript-driven motion (a number counting up, say) has to
 * ask, because there is no stylesheet to disable.
 */
export function useReducedMotion(): boolean {
  // Start suppressed so the very first render never animates before we know.
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () =>
      setReduced(query.matches || document.documentElement.classList.contains("reduce-motion"));

    read();
    query.addEventListener("change", read);

    // The app toggle flips a class on <html> rather than firing an event, so
    // watch the attribute to stay in step with the settings page.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      query.removeEventListener("change", read);
      observer.disconnect();
    };
  }, []);

  return reduced;
}
