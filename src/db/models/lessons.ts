import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * A lesson screen. The original shape was `{ heading, body }` -- two or three
 * sentences of prose per screen, which assumed the reader already knew what a
 * sender address was and what a suspicious one looked like. Someone meeting
 * this material for the first time needs to be shown, not told.
 *
 * Screens are therefore a discriminated union. `prose` keeps the original
 * shape, and `kind` is optional on it so every lesson written before this
 * change still parses.
 */
export type LessonScreen =
  | ProseScreen
  | AnatomyScreen
  | AnnotatedScreen
  | CompareScreen
  | StepsScreen
  | CheckpointScreen;

export interface ProseScreen {
  kind?: "prose";
  heading: string;
  body: string;
}

/** A worked example with numbered callouts pointing at specific details. */
export interface AnatomyScreen {
  kind: "anatomy";
  heading: string;
  intro: string;
  sample: {
    displayName: string;
    address: string;
    subject: string;
    body: string;
    linkText: string;
    linkHref: string;
  };
  /** Each callout names one detail and explains why it matters. */
  callouts: { target: "displayName" | "address" | "subject" | "body" | "link"; detail: string }[];
}

/**
 * The same "hover a note, see the detail light up" exercise as AnatomyScreen,
 * for the mediums that are not email.
 *
 * AnatomyScreen draws real inbox chrome -- a From line, a subject, a link
 * button -- which is what makes the email lesson land, and is exactly wrong for
 * a phone call or a printed notice. Rather than bend those fields into meaning
 * something they do not, this takes labelled rows and a frame caption, so a
 * call transcript is presented as a call and a QR notice as a notice. The
 * callout interaction is shared between the two.
 */
export interface AnnotatedScreen {
  kind: "annotated";
  heading: string;
  intro: string;
  /** Caption on the sample's header, e.g. "Text message" or "Call transcript". */
  frame: string;
  /**
   * The sample, top to bottom. `label` is the field name shown beside the
   * value; omit it for body text that stands on its own. `mono` is for values
   * a reader is meant to inspect character by character -- numbers, handles,
   * URLs.
   */
  parts: { id: string; label?: string; value: string; mono?: boolean }[];
  /** Each callout names one part by id and explains why it matters. */
  callouts: { target: string; label: string; detail: string }[];
}

/** Genuine beside fake, so the difference is visible rather than described. */
export interface CompareScreen {
  kind: "compare";
  heading: string;
  intro: string;
  rows: { label: string; genuine: string; fake: string; note: string }[];
}

/** Concrete checks, in the order a reader should actually perform them. */
export interface StepsScreen {
  kind: "steps";
  heading: string;
  intro: string;
  steps: { action: string; lookFor: string; warningSign: string }[];
}

/** A two-option question with feedback for whichever answer is chosen. */
export interface CheckpointScreen {
  kind: "checkpoint";
  heading: string;
  prompt: string;
  options: { label: string; correct: boolean; feedback: string }[];
}

export interface LessonDoc extends SpecConventions {
  _id: string; // slug, e.g. "email-phishing" -- lessons don't need ObjectId ids
  lessonId: string; // named PK per the shared spec -- mirrors _id (string here, see 01-validators.js)
  vector: string;
  title: string;
  summary: string;
  screens: LessonScreen[];
  redFlags: string[];
  difficulty: number;
  order: number; // renamed from sortOrder to match the shared spec's field name
}

export type InsertLesson = LessonDoc;

export const LESSONS_COLLECTION = "lessons";

export function lessonsCollection() {
  return getCollection<LessonDoc>(LESSONS_COLLECTION);
}
