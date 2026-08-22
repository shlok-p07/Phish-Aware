import type { ScenarioDoc } from "@/db";
import { CUE_LABELS, type CueId } from "./cues";

/**
 * How significant a red flag must be before a learner is held responsible for
 * missing it.
 *
 * Generated scenarios enumerate every cue that could plausibly apply, so two
 * thirds of the phishing pool carried at least one the model itself rated 1 or 2
 * -- in one case a `spelling_grammar` cue whose own explanation read "the
 * sentence structure and spelling are mostly correct". Grading against those
 * told learners they had missed red flags that were not really there, and it
 * flooded the review scheduler with noise instead of genuine weaknesses.
 *
 * They stay listed on the scenario, so selecting one is still not counted as a
 * false positive. They just do not count against the learner.
 */
export const GRADED_CUE_SEVERITY_FLOOR = 3;

/**
 * The most red flags one scenario will hold a learner accountable for.
 *
 * A fifth of the pool listed five to seven. "Worth noting for next time" then
 * became a list of seven items, which is not feedback anybody acts on.
 */
export const MAX_GRADED_CUES = 4;

/**
 * The red flags an attempt is scored against: the most significant few.
 *
 * A phishing scenario always yields at least one. Sixteen scenarios in the pool
 * have nothing at or above the floor, and reporting "nothing missed" on a
 * message that was in fact phishing would be worse than grading a weak cue.
 */
export function gradedCues(scenario: Pick<ScenarioDoc, "cues">): CueId[] {
  const ranked = [...scenario.cues].sort((a, b) => b.severity - a.severity);
  const significant = ranked.filter((c) => c.severity >= GRADED_CUE_SEVERITY_FLOOR);
  const chosen = significant.length > 0 ? significant : ranked.slice(0, 1);
  return chosen.slice(0, MAX_GRADED_CUES).map((c) => c.type);
}

export interface GradedAttempt {
  correct: boolean;
  /**
   * What the answer actually was: true for phishing, false for legitimate.
   *
   * This used to be assigned the same value as `correct`, so a field named "the
   * correct verdict" in fact held "was the verdict correct" -- identical to its
   * neighbour, and the opposite of what any consumer of the shared spec would
   * read it as.
   */
  correctVerdict: boolean;
  /**
   * The de-duplicated selection actually used for scoring. Callers persist this
   * rather than the raw request array, so the stored attempt is exactly what was
   * graded -- a record that disagrees with its own score is worse than useless
   * to the analytics and adaptive engines that read it.
   */
  selectedCues: CueId[];
  caughtCues: CueId[];
  missedCues: CueId[];
  falseCues: CueId[];
  explanation: string;
  calibrationNote: string;
  xpAwarded: number;
}

export function gradeAttempt(
  scenario: ScenarioDoc,
  userVerdict: boolean,
  selectedCues: CueId[],
  confidence: number,
): GradedAttempt {
  const actualCueIds = scenario.cues.map((c) => c.type);
  // Every cue the scenario lists, versus the few the learner is accountable for.
  const gradedCueIds = gradedCues(scenario);
  const correct = userVerdict === scenario.isPhish;

  // The client can only toggle each cue once, but the request body is just a
  // JSON array with no uniqueness constraint -- dedupe here so a raw POST
  // with repeated entries can't farm extra XP (or extra penalty) per repeat.
  const uniqueSelectedCues = Array.from(new Set(selectedCues));

  const caughtCues = gradedCueIds.filter((c) => uniqueSelectedCues.includes(c));
  const missedCues = gradedCueIds.filter((c) => !uniqueSelectedCues.includes(c));
  // Only cues the scenario does not carry at all. Picking a real but minor one
  // is neither rewarded nor punished: it is a fair read of the message, and
  // penalising it would teach learners to under-report.
  const falseCues = uniqueSelectedCues.filter((c) => !actualCueIds.includes(c));

  let xpAwarded = 0;
  if (correct) {
    xpAwarded += 15;
    xpAwarded += caughtCues.length * 5;
    xpAwarded -= falseCues.length * 2;
  } else {
    xpAwarded += 5; // consolation xp for attempting
  }
  xpAwarded = Math.max(0, xpAwarded);

  const explanation = buildExplanation(scenario, correct, caughtCues, missedCues);
  const calibrationNote = buildCalibrationNote(correct, confidence);

  return {
    correct,
    selectedCues: uniqueSelectedCues,
    correctVerdict: scenario.isPhish,
    caughtCues,
    missedCues,
    falseCues,
    explanation,
    calibrationNote,
    xpAwarded,
  };
}

function buildExplanation(
  scenario: ScenarioDoc,
  wasCorrect: boolean,
  caughtCues: CueId[],
  missedCues: CueId[],
): string {
  const verdictLine = scenario.isPhish
    ? wasCorrect
      ? "Nice catch -- this one was phishing."
      : "This one was actually phishing, even though it looked convincing."
    : wasCorrect
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

function buildCalibrationNote(wasCorrect: boolean, confidence: number): string {
  if (wasCorrect && confidence >= 65) {
    return "Great calibration -- you were confident and right.";
  }
  if (wasCorrect && confidence < 40) {
    return "You were right but hesitant -- trust the cues you spotted a bit more.";
  }
  if (!wasCorrect && confidence >= 65) {
    return "You were very confident here, but it didn't hold up -- worth slowing down on similar messages.";
  }
  if (!wasCorrect && confidence < 40) {
    return "Good instinct to hesitate -- let's sharpen your eye for this pattern.";
  }
  return "Keep practicing to build sharper instincts on messages like this one.";
}
