"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/** Ease-out cubic: quick off the mark, gentle at the end. */
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts from the value on screen to a new one whenever `value` changes.
 *
 * Mounting does not animate: the number that is already correct should not be
 * replaced by a wrong one for the sake of an effect. For an entrance, pair it
 * with the `pa-rise` class, which fades the element in without touching the
 * value it reports.
 *
 * Two details are deliberate. `animated` starts as null meaning "not animating,
 * show the real number", so the value is never withheld -- under reduced motion
 * the effect returns immediately and the real number is what renders. And state
 * is only ever set inside the animation frame, never synchronously in the
 * effect body, which would trigger a cascading render.
 */
export function CountUp({
  value,
  durationMs = 700,
  className = "",
  prefix = "",
}: {
  value: number;
  durationMs?: number;
  className?: string;
  prefix?: string;
}) {
  const reduced = useReducedMotion();
  const [animated, setAnimated] = useState<number | null>(null);
  // Seeded with the mount value, not zero, so the first paint shows the real
  // number. Starting from zero meant the final value painted once and then
  // jumped backwards to zero as the first animation frame landed -- a visible
  // flicker. Counting up is for a value that *changes* while on screen.
  const shownRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;

    const from = shownRef.current;
    if (from === value) return;

    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      const next = Math.round(from + (value - from) * ease(t));
      shownRef.current = next;
      setAnimated(next);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      // Land on the target so unmounting mid-count cannot strand the next
      // mount partway through a previous animation.
      shownRef.current = value;
    };
  }, [value, durationMs, reduced]);

  // One text node rather than {prefix}{number}: a screen reader announces
  // "+15" as a single string, and the DOM stays queryable as one piece of text.
  return (
    <span className={className} aria-live="polite">
      {`${prefix}${animated ?? value}`}
    </span>
  );
}
