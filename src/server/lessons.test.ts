import { describe, expect, it } from "bun:test";
import { LESSONS } from "./lessons";
import { CUE_LABELS, type CueId } from "./cues";
import { PRACTICE_VECTORS } from "./attackProfiles";
import { GetLessonResponse } from "@/api-zod";

const CUE_IDS = new Set(Object.keys(CUE_LABELS));

describe("lesson library", () => {
  it("covers every vector a learner can practise", () => {
    // A vector you can be tested on with no lesson to prepare from is the gap
    // this asserts against.
    expect([...LESSONS.map((l) => l.vector)].sort()).toEqual([...PRACTICE_VECTORS].sort());
  });

  it("has no duplicate ids or vectors", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(new Set(LESSONS.map((l) => l.vector)).size).toBe(LESSONS.length);
  });

  it("only cites red flags that exist in the shared cue vocabulary", () => {
    for (const lesson of LESSONS) {
      for (const flag of lesson.redFlags) {
        expect(CUE_IDS.has(flag)).toBe(true);
      }
    }
  });

  it("teaches rather than summarises: every lesson works an example and asks a question", () => {
    // The five non-email lessons were three two-sentence prose screens each,
    // which told a first-time reader what the word meant and nothing about what
    // to do. This is the floor that stops that shipping again.
    for (const lesson of LESSONS) {
      const kinds = lesson.screens.map((s) => s.kind ?? "prose");
      expect(kinds).toContain("compare");
      expect(kinds).toContain("steps");
      expect(kinds).toContain("checkpoint");
      // Either shape of worked example counts.
      expect(kinds.some((k) => k === "anatomy" || k === "annotated")).toBe(true);
    }
  });

  it("gives every checkpoint exactly one correct answer and feedback for both", () => {
    for (const lesson of LESSONS) {
      for (const screen of lesson.screens) {
        if (screen.kind !== "checkpoint") continue;
        expect(screen.options.filter((o) => o.correct)).toHaveLength(1);
        for (const option of screen.options) {
          // Feedback on the wrong answer is where the teaching happens, so an
          // empty or throwaway string is a content bug.
          expect(option.feedback.length).toBeGreaterThan(80);
        }
      }
    }
  });

  it("points every callout at a part of the sample that exists", () => {
    for (const lesson of LESSONS) {
      for (const screen of lesson.screens) {
        if (screen.kind !== "annotated") continue;
        const ids = new Set(screen.parts.map((p) => p.id));
        for (const callout of screen.callouts) {
          // A callout naming a missing id silently highlights nothing, which
          // reads as a broken lesson rather than a broken build.
          expect(ids.has(callout.target)).toBe(true);
        }
        expect(new Set(screen.parts.map((p) => p.id)).size).toBe(screen.parts.length);
      }
    }
  });

  it("labels every callout, so the list is readable before anything is hovered", () => {
    for (const lesson of LESSONS) {
      for (const screen of lesson.screens) {
        if (screen.kind !== "annotated") continue;
        for (const callout of screen.callouts) {
          expect(callout.label.trim().length).toBeGreaterThan(0);
          expect(callout.detail.length).toBeGreaterThan(80);
        }
      }
    }
  });

  it("keeps every compare and steps screen substantive", () => {
    for (const lesson of LESSONS) {
      for (const screen of lesson.screens) {
        if (screen.kind === "compare") {
          expect(screen.rows.length).toBeGreaterThanOrEqual(3);
          for (const row of screen.rows) {
            expect(row.note.trim().length).toBeGreaterThan(0);
          }
        }
        if (screen.kind === "steps") {
          expect(screen.steps.length).toBeGreaterThanOrEqual(3);
          for (const step of screen.steps) {
            // A step with no warning sign is an instruction, not a check.
            expect(step.warningSign.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("never leaves a placeholder in learner-facing copy", () => {
    const placeholder = /\b(TODO|TBD|lorem ipsum|coming soon|placeholder)\b/i;
    for (const lesson of LESSONS) {
      const text = JSON.stringify(lesson);
      expect(placeholder.test(text)).toBe(false);
    }
  });

  it("still declares a summary and a title for every lesson", () => {
    for (const lesson of LESSONS) {
      expect(lesson.title.trim().length).toBeGreaterThan(0);
      expect(lesson.summary.trim().length).toBeGreaterThan(20);
    }
  });
});

describe("cue vocabulary", () => {
  it("is what the lessons' red flags are typed against", () => {
    // Guards the cast in the lesson type: if a cue id is renamed, this fails
    // rather than the lessons silently citing a flag that no longer exists.
    const ids: CueId[] = Object.keys(CUE_LABELS) as CueId[];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(CUE_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe("lessons satisfy the API contract they are served through", () => {
  // GET /api/lessons/[id] runs its response through GetLessonResponse.parse.
  // The contract described a lesson screen as { heading, body } long after the
  // richer screen kinds existed, so every lesson containing one -- which by then
  // meant every lesson -- came back 400 and no lesson page rendered at all.
  // Nothing caught it: the model, the renderer and the seed all agreed, and the
  // one component that disagreed was the schema in between.
  it.each(LESSONS.map((l) => [l.id, l] as const))("%s parses as a lesson response", (_id, lesson) => {
    const parsed = GetLessonResponse.safeParse({
      id: lesson.id,
      vector: lesson.vector,
      title: lesson.title,
      summary: lesson.summary,
      screens: lesson.screens,
      redFlags: lesson.redFlags,
    });
    if (!parsed.success) {
      throw new Error(
        `${lesson.id} would be rejected by its own endpoint:\n` +
          JSON.stringify(parsed.error.issues, null, 2),
      );
    }
  });

  it("keeps every screen kind representable, not just the ones in use today", () => {
    // Asserts the union actually discriminates: a screen missing its required
    // fields must fail rather than quietly matching the prose branch.
    const bad = GetLessonResponse.safeParse({
      id: "x",
      vector: "email",
      title: "x",
      summary: "x",
      screens: [{ kind: "annotated", heading: "h", intro: "i" }],
      redFlags: [],
    });
    expect(bad.success).toBe(false);
  });
});
