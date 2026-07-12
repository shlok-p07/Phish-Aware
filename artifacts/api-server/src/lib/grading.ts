import type { Scenario } from "@workspace/db";
import { CUE_LABELS, type CueId } from "./cues";

export interface GradedAttempt {
  correct: boolean;
  correctVerdict: boolean;
  caughtCues: CueId[];
  missedCues: CueId[];
  falseCues: CueId[];
  explanation: string;
  calibrationNote: string;
  xpAwarded: number;
}

export function gradeAttempt(
  scenario: Scenario,
  userVerdict: boolean,
  selectedCues: CueId[],
  confidence: number,
): GradedAttempt {
  const actualCueIds = scenario.cues.map((c) => c.label as CueId);
  const correctVerdict = userVerdict === scenario.isPhish;

  const caughtCues = selectedCues.filter((c) => actualCueIds.includes(c));
  const missedCues = actualCueIds.filter((c) => !selectedCues.includes(c));
  const falseCues = selectedCues.filter((c) => !actualCueIds.includes(c));

  let xpAwarded = 0;
  if (correctVerdict) {
    xpAwarded += 15;
    xpAwarded += caughtCues.length * 5;
    xpAwarded -= falseCues.length * 2;
  } else {
    xpAwarded += 5; // consolation xp for attempting
  }
  xpAwarded = Math.max(0, xpAwarded);

  const explanation = buildExplanation(scenario, correctVerdict, caughtCues, missedCues);
  const calibrationNote = buildCalibrationNote(correctVerdict, confidence);

  return {
    correct: correctVerdict,
    correctVerdict,
    caughtCues,
    missedCues,
    falseCues,
    explanation,
    calibrationNote,
    xpAwarded,
  };
}

function buildExplanation(
  scenario: Scenario,
  correctVerdict: boolean,
  caughtCues: CueId[],
  missedCues: CueId[],
): string {
  const verdictLine = scenario.isPhish
    ? correctVerdict
      ? "Nice catch -- this one was phishing."
      : "This one was actually phishing, even though it looked convincing."
    : correctVerdict
      ? "Good call -- this message was legitimate."
      : "This message was actually legitimate; it just had some suspicious-looking traits.";

  const caughtLine =
    caughtCues.length > 0
      ? `You correctly flagged: ${caughtCues.map((c) => CUE_LABELS[c]).join(", ")}.`
      : scenario.isPhish
        ? "You didn't flag any of the specific red flags this time."
        : "";

  const missedLine =
    missedCues.length > 0
      ? `Worth noting for next time: ${missedCues.map((c) => CUE_LABELS[c]).join(", ")}.`
      : scenario.isPhish
        ? "You caught every red flag in this one."
        : "";

  return [verdictLine, caughtLine, missedLine].filter(Boolean).join(" ");
}

function buildCalibrationNote(correctVerdict: boolean, confidence: number): string {
  if (correctVerdict && confidence >= 65) {
    return "Great calibration -- you were confident and right.";
  }
  if (correctVerdict && confidence < 40) {
    return "You were right but hesitant -- trust the cues you spotted a bit more.";
  }
  if (!correctVerdict && confidence >= 65) {
    return "You were very confident here, but it didn't hold up -- worth slowing down on similar messages.";
  }
  if (!correctVerdict && confidence < 40) {
    return "Good instinct to hesitate -- let's sharpen your eye for this pattern.";
  }
  return "Keep practicing to build sharper instincts on messages like this one.";
}
