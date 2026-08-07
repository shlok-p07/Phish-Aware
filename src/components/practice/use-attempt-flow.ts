"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { AttemptResult } from "@/api-client";
import type { CueId } from "@/server/cues";

/** The four screens of one practice round, in order. */
export type PracticeStep = "inspect" | "cues" | "confidence" | "feedback";

export const DEFAULT_CONFIDENCE = 50;

export interface AttemptFlow {
  step: PracticeStep;
  /** true = the learner called it phishing. Null until they commit. */
  verdict: boolean | null;
  selectedCues: CueId[];
  confidence: number;
  result: AttemptResult | null;
  /** Red flag hovered on the results screen; drives the in-message highlight. */
  activeCue: string | null;
  /** Where this scenario's explanation lands in the shared chat transcript. */
  explainIndex: number | null;

  setConfidence: (value: number) => void;
  /** Full React setter: callers use the updater form on blur/mouse-leave. */
  setActiveCue: Dispatch<SetStateAction<string | null>>;
  setExplainIndex: (index: number | null) => void;

  /** Commit a verdict and advance. Legitimate skips cues -- they are red flags. */
  commitVerdict: (isPhishing: boolean) => void;
  /** Reconsider the verdict itself. Nothing is scored until submit. */
  backToInspect: () => void;
  toggleCue: (cueId: CueId) => void;
  goToConfidence: () => void;
  /** "Back" from confidence: to cues if they said phishing, else to inspect. */
  backFromConfidence: () => void;
  /** Record a graded result and show the feedback screen. */
  applyResult: (result: AttemptResult) => void;
  /** Clear everything back to a fresh round. */
  reset: () => void;
}

/**
 * The verdict -> cues -> confidence -> feedback state machine for one practice
 * round.
 *
 * Extracted from PracticePage so the progression can be tested without
 * rendering the page (which needs a router, a query client and a live
 * scenario). It also removes a duplicated seven-line reset that previously
 * appeared in both "next scenario" and "change vector" -- two copies that had
 * to be kept in step by hand.
 */
export function useAttemptFlow(): AttemptFlow {
  const [step, setStep] = useState<PracticeStep>("inspect");
  const [verdict, setVerdict] = useState<boolean | null>(null);
  // CueId rather than string: the API takes CueId[], and typing this loosely
  // is what previously forced an `as any[]` cast at the submit call.
  const [selectedCues, setSelectedCues] = useState<CueId[]>([]);
  const [confidence, setConfidence] = useState<number>(DEFAULT_CONFIDENCE);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [activeCue, setActiveCue] = useState<string | null>(null);
  const [explainIndex, setExplainIndex] = useState<number | null>(null);

  const commitVerdict = useCallback((isPhishing: boolean) => {
    setVerdict(isPhishing);
    setSelectedCues([]);
    setStep(isPhishing ? "cues" : "confidence");
  }, []);

  const backToInspect = useCallback(() => {
    setVerdict(null);
    setSelectedCues([]);
    setStep("inspect");
  }, []);

  const toggleCue = useCallback((cueId: CueId) => {
    setSelectedCues((prev) =>
      prev.includes(cueId) ? prev.filter((id) => id !== cueId) : [...prev, cueId],
    );
  }, []);

  const goToConfidence = useCallback(() => setStep("confidence"), []);

  const backFromConfidence = useCallback(
    () => setStep(verdict ? "cues" : "inspect"),
    [verdict],
  );

  const applyResult = useCallback((next: AttemptResult) => {
    setResult(next);
    setStep("feedback");
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setVerdict(null);
    setSelectedCues([]);
    setConfidence(DEFAULT_CONFIDENCE);
    setActiveCue(null);
    setExplainIndex(null);
    setStep("inspect");
  }, []);

  return {
    step, verdict, selectedCues, confidence, result, activeCue, explainIndex,
    setConfidence, setActiveCue, setExplainIndex,
    commitVerdict, backToInspect, toggleCue, goToConfidence, backFromConfidence,
    applyResult, reset,
  };
}
