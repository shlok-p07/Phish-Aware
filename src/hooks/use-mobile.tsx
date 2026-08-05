"use client";
import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT;
// Matches the old hook's pre-mount value: it started `undefined` and was
// returned as `!!isMobile`, i.e. false until the effect first ran.
const getServerSnapshot = () => false;

/**
 * Tracks whether the viewport is below the mobile breakpoint.
 *
 * Subscribes through useSyncExternalStore rather than copying matchMedia into
 * state from an effect: this is an external store, so React can read it during
 * render and keep server and client output consistent without an extra pass.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
