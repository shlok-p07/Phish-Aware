"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// three.js is heavy and browser-only — keep it out of the server render and the
// initial bundle.
const Antigravity = dynamic(() => import("@/components/antigravity"), {
  ssr: false,
});

const FALLBACK_COLOR = "hsl(221, 70%, 40%)";

/** Reads the `--primary` design token, stored as bare HSL channels ("221 70% 40%"). */
function readPrimaryColor() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  const [h, s, l] = raw.split(/\s+/);
  return h && s && l ? `hsl(${h}, ${s}, ${l})` : FALLBACK_COLOR;
}

export function AntigravityBackground() {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    setColor(readPrimaryColor());

    // The theme (and high-contrast) classes live on <html>; re-read the token
    // whenever they change rather than trusting next-themes' effect ordering.
    const observer = new MutationObserver(() => setColor(readPrimaryColor()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  if (color === null) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-40 dark:opacity-55"
    >
      <Antigravity color={color} />
    </div>
  );
}
