"use client";
import { useSyncExternalStore } from "react";

// Never fires -- the value this store reports can only change once, and React
// already re-renders after hydration.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * False while rendering on the server and during hydration, true afterwards.
 *
 * Use for values that are only knowable on the client (resolved theme, media
 * queries, anything from localStorage) so the first client render matches the
 * server's markup.
 *
 * This replaces the `const [mounted, setMounted] = useState(false);
 * useEffect(() => setMounted(true), [])` idiom, which does the same thing via a
 * state update in an effect -- an extra render pass, and the exact pattern the
 * React Compiler flags.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
