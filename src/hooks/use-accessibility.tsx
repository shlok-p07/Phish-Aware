"use client";
import { createContext, useContext, useEffect, useState } from "react";

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

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>("normal");
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [highContrast, setHighContrastState] = useState(false);
  const [dyslexiaFont, setDyslexiaFontState] = useState(false);
  const [largeTargets, setLargeTargetsState] = useState(false);

  // Hydrate from localStorage on mount (falling back to system defaults) and apply to <html>.
  useEffect(() => {
    const storedSize = localStorage.getItem(TEXT_SIZE_KEY) as TextSize | null;
    if (storedSize) {
      setTextSizeState(storedSize);
      applyTextSize(storedSize);
    }

    const motion = resolveBoolean(REDUCE_MOTION_KEY, "(prefers-reduced-motion: reduce)");
    setReduceMotionState(motion);
    applyClass("reduce-motion", motion);

    const contrast = resolveBoolean(HIGH_CONTRAST_KEY, "(prefers-contrast: more)");
    setHighContrastState(contrast);
    applyClass("high-contrast", contrast);

    const dyslexia = resolveBoolean(DYSLEXIA_FONT_KEY);
    setDyslexiaFontState(dyslexia);
    applyClass("dyslexia-font", dyslexia);

    // Coarse pointers (touch) benefit from larger targets by default.
    const targets = resolveBoolean(LARGE_TARGETS_KEY, "(pointer: coarse)");
    setLargeTargetsState(targets);
    applyClass("large-targets", targets);
  }, []);

  const makeSetter =
    (key: string, className: string, setState: (v: boolean) => void) => (value: boolean) => {
      setState(value);
      localStorage.setItem(key, String(value));
      applyClass(className, value);
    };

  const setTextSize = (size: TextSize) => {
    setTextSizeState(size);
    localStorage.setItem(TEXT_SIZE_KEY, size);
    applyTextSize(size);
  };

  const setReduceMotion = makeSetter(REDUCE_MOTION_KEY, "reduce-motion", setReduceMotionState);
  const setHighContrast = makeSetter(HIGH_CONTRAST_KEY, "high-contrast", setHighContrastState);
  const setDyslexiaFont = makeSetter(DYSLEXIA_FONT_KEY, "dyslexia-font", setDyslexiaFontState);
  const setLargeTargets = makeSetter(LARGE_TARGETS_KEY, "large-targets", setLargeTargetsState);

  return (
    <AccessibilityContext.Provider
      value={{
        textSize,
        reduceMotion,
        highContrast,
        dyslexiaFont,
        largeTargets,
        setTextSize,
        setReduceMotion,
        setHighContrast,
        setDyslexiaFont,
        setLargeTargets,
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
