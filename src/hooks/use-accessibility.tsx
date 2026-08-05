"use client";
import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

export type TextSize = "normal" | "large" | "xlarge";

type AccessibilityState = {
  textSize: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
  dyslexiaFont: boolean;
  largeTargets: boolean;
  setTextSize: (size: TextSize) => void;
  setReduceMotion: (value: boolean) => void;
  setHighContrast: (value: boolean) => void;
  setDyslexiaFont: (value: boolean) => void;
  setLargeTargets: (value: boolean) => void;
};

const TEXT_SIZE_KEY = "a11y_textSize";
const REDUCE_MOTION_KEY = "a11y_reduceMotion";
const HIGH_CONTRAST_KEY = "a11y_highContrast";
const DYSLEXIA_FONT_KEY = "a11y_dyslexiaFont";
const LARGE_TARGETS_KEY = "a11y_largeTargets";

const AccessibilityContext = createContext<AccessibilityState | null>(null);

function applyTextSize(size: TextSize) {
  const root = document.documentElement;
  root.classList.remove("text-scale-lg", "text-scale-xl");
  if (size === "large") root.classList.add("text-scale-lg");
  else if (size === "xlarge") root.classList.add("text-scale-xl");
}

function applyClass(className: string, value: boolean) {
  document.documentElement.classList.toggle(className, value);
}

/**
 * Read a stored boolean preference. When the user hasn't set one, fall back to
 * the matching system media query (auto-detect) so OS accessibility settings
 * are respected out of the box.
 */
function resolveBoolean(key: string, systemQuery?: string): boolean {
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored === "true";
  if (systemQuery && window.matchMedia) return window.matchMedia(systemQuery).matches;
  return false;
}

type Preferences = {
  textSize: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
  dyslexiaFont: boolean;
  largeTargets: boolean;
};

/*
 * localStorage + the system media queries are an external store, so they're
 * read through useSyncExternalStore rather than copied into state by an effect.
 * The previous version did the latter, which meant an extra render pass on every
 * mount and is the pattern the React Compiler rejects.
 *
 * The snapshot is cached because useSyncExternalStore compares snapshots by
 * identity -- building a fresh object on each call would loop forever.
 */
let cachedSnapshot: Preferences | null = null;
const listeners = new Set<() => void>();

function readPreferences(): Preferences {
  return {
    textSize: (localStorage.getItem(TEXT_SIZE_KEY) as TextSize | null) ?? "normal",
    reduceMotion: resolveBoolean(REDUCE_MOTION_KEY, "(prefers-reduced-motion: reduce)"),
    highContrast: resolveBoolean(HIGH_CONTRAST_KEY, "(prefers-contrast: more)"),
    dyslexiaFont: resolveBoolean(DYSLEXIA_FONT_KEY),
    // Coarse pointers (touch) benefit from larger targets by default.
    largeTargets: resolveBoolean(LARGE_TARGETS_KEY, "(pointer: coarse)"),
  };
}

function getSnapshot(): Preferences {
  cachedSnapshot ??= readPreferences();
  return cachedSnapshot;
}

/** Defaults used for SSR and the hydration render, before storage is readable. */
const SERVER_SNAPSHOT: Preferences = {
  textSize: "normal",
  reduceMotion: false,
  highContrast: false,
  dyslexiaFont: false,
  largeTargets: false,
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Invalidate the cache and wake every subscriber. */
function notify() {
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Mirroring preferences onto <html> is a genuine external side effect, so it
  // stays in an effect -- it just no longer sets state while it's at it.
  useEffect(() => {
    applyTextSize(prefs.textSize);
    applyClass("reduce-motion", prefs.reduceMotion);
    applyClass("high-contrast", prefs.highContrast);
    applyClass("dyslexia-font", prefs.dyslexiaFont);
    applyClass("large-targets", prefs.largeTargets);
  }, [prefs]);

  const makeSetter = (key: string) => (value: boolean) => {
    localStorage.setItem(key, String(value));
    notify();
  };

  const setTextSize = (size: TextSize) => {
    localStorage.setItem(TEXT_SIZE_KEY, size);
    notify();
  };

  return (
    <AccessibilityContext.Provider
      value={{
        ...prefs,
        setTextSize,
        setReduceMotion: makeSetter(REDUCE_MOTION_KEY),
        setHighContrast: makeSetter(HIGH_CONTRAST_KEY),
        setDyslexiaFont: makeSetter(DYSLEXIA_FONT_KEY),
        setLargeTargets: makeSetter(LARGE_TARGETS_KEY),
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within an AccessibilityProvider");
  return ctx;
}
