"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades/slides a section in once it scrolls into view. CSS in globals.css
 * disables the transition entirely under prefers-reduced-motion, so this
 * degrades to "just visible" rather than skipping the motion but leaving
 * the element stuck at opacity: 0.
 */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? "reveal-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
