import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAttemptFlow, DEFAULT_CONFIDENCE } from "./use-attempt-flow";
import type { AttemptResult } from "@/api-client";
import type { CueId } from "@/server/cues";

const RESULT = {
  correct: true,
  correctVerdict: true,
  caughtCues: [],
  missedCues: [],
  falseCues: [],
  explanation: "",
  calibrationNote: "",
} as unknown as AttemptResult;

const DOMAIN = "sender_domain" as CueId;
const URGENCY = "urgency_language" as CueId;

describe("useAttemptFlow", () => {
  it("starts on inspect with nothing committed", () => {
    const { result } = renderHook(() => useAttemptFlow());
    expect(result.current.step).toBe("inspect");
    expect(result.current.verdict).toBeNull();
    expect(result.current.selectedCues).toEqual([]);
    expect(result.current.confidence).toBe(DEFAULT_CONFIDENCE);
  });

  it("goes to cue selection when the learner says phishing", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.commitVerdict(true));
    expect(result.current.verdict).toBe(true);
    expect(result.current.step).toBe("cues");
  });

  // Cues are red flags, so there is nothing to name on a legitimate message.
  it("skips cue selection when the learner says legitimate", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.commitVerdict(false));
    expect(result.current.step).toBe("confidence");
  });

  it("toggles a cue on and off without duplicating it", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.toggleCue(DOMAIN));
    act(() => result.current.toggleCue(URGENCY));
    expect(result.current.selectedCues).toEqual([DOMAIN, URGENCY]);
    act(() => result.current.toggleCue(DOMAIN));
    expect(result.current.selectedCues).toEqual([URGENCY]);
  });

  // Nothing is scored until submit, so reconsidering must be allowed.
  it("clears the verdict and cues when going back to inspect", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.commitVerdict(true));
    act(() => result.current.toggleCue(DOMAIN));
    act(() => result.current.backToInspect());
    expect(result.current.step).toBe("inspect");
    expect(result.current.verdict).toBeNull();
    expect(result.current.selectedCues).toEqual([]);
  });

  it("changing the verdict discards cues picked under the old one", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.commitVerdict(true));
    act(() => result.current.toggleCue(DOMAIN));
    act(() => result.current.commitVerdict(false));
    expect(result.current.selectedCues).toEqual([]);
  });

  describe("back from confidence", () => {
    it("returns to cues when the verdict was phishing", () => {
      const { result } = renderHook(() => useAttemptFlow());
      act(() => result.current.commitVerdict(true));
      act(() => result.current.goToConfidence());
      act(() => result.current.backFromConfidence());
      expect(result.current.step).toBe("cues");
    });

    it("returns to inspect when the verdict was legitimate", () => {
      const { result } = renderHook(() => useAttemptFlow());
      act(() => result.current.commitVerdict(false));
      act(() => result.current.backFromConfidence());
      expect(result.current.step).toBe("inspect");
    });
  });

  it("shows feedback once a result is applied", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.applyResult(RESULT));
    expect(result.current.step).toBe("feedback");
    expect(result.current.result).toBe(RESULT);
  });

  // One reset used by both "next scenario" and "change vector" -- these were
  // two hand-maintained copies of the same seven assignments before.
  it("reset clears every field back to a fresh round", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => {
      result.current.commitVerdict(true);
      result.current.toggleCue(DOMAIN);
      result.current.setConfidence(90);
      result.current.setActiveCue(DOMAIN);
      result.current.setExplainIndex(3);
      result.current.applyResult(RESULT);
    });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({
      step: "inspect",
      verdict: null,
      selectedCues: [],
      confidence: DEFAULT_CONFIDENCE,
      result: null,
      activeCue: null,
      explainIndex: null,
    });
  });

  it("supports the functional updater form the hover handlers rely on", () => {
    const { result } = renderHook(() => useAttemptFlow());
    act(() => result.current.setActiveCue(DOMAIN));
    act(() => result.current.setActiveCue((a) => (a === DOMAIN ? null : a)));
    expect(result.current.activeCue).toBeNull();
  });
});
