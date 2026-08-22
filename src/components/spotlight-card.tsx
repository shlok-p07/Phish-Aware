"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

/**
 * A card that lights up under the pointer.
 *
 * The effect is a soft radial wash that tracks the cursor, plus a border that
 * brightens on the side you approach from. Restraint is the whole point: at this
 * opacity it reads as the surface catching light rather than as an animation, and
 * a marketing page that flashes at every hover looks cheap on the second visit.
 *
 * Written to be cheap and well-behaved rather than clever:
 *
 * - Pointer position is written straight to CSS custom properties on the node.
 *   Holding it in React state would re-render this subtree on every mousemove --
 *   dozens of renders a second, for a decoration.
 * - The listener is attached only when the device actually has a hovering
 *   pointer, so a phone pays nothing for it and never gets a highlight stuck
 *   where a finger last touched.
 * - It is skipped entirely under prefers-reduced-motion. The card keeps its
 *   border and shadow, so nothing depends on the effect to be legible.
 * - The wash sits in a pointer-events: none layer, so it cannot swallow a click
 *   on anything inside the card.
 * - Keyboard users get a focus ring instead, because a pointer-only affordance
 *   is not an affordance for everyone.
 */
export function SpotlightCard({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** So a card can still be a semantic element -- article, li -- where that fits. */
  as?: "div" | "article" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);

  const setPosition = useCallback((x: number, y: number) => {
    const node = ref.current;
    if (!node) return;
    // Coalesced into one write per frame: a mousemove can fire far more often
    // than the screen refreshes, and every extra write is a wasted style
    // recalculation.
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = ref.current;
      if (!current) return;
      const rect = current.getBoundingClientRect();
      current.style.setProperty("--spot-x", `${x - rect.left}px`);
      current.style.setProperty("--spot-y", `${y - rect.top}px`);
    });
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // A device with no hovering pointer would otherwise leave the wash stuck
    // wherever a finger last landed.
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!canHover.matches || reduced.matches) return;

    const onMove = (event: PointerEvent) => setPosition(event.clientX, event.clientY);
    const onLeave = () => node.style.removeProperty("--spot-opacity");
    const onEnter = () => node.style.setProperty("--spot-opacity", "1");

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerenter", onEnter);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerenter", onEnter);
      node.removeEventListener("pointerleave", onLeave);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [setPosition]);

  return (
    <Tag
      ref={ref as never}
      data-spotlight
      className={`pa-spotlight group relative isolate overflow-hidden ${className}`}
    >
      {/* Decorative, and deliberately inert to the pointer. */}
      <span aria-hidden="true" className="pa-spotlight-wash" />
      {children}
    </Tag>
  );
}
