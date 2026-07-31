import { z } from "zod";

/**
 * The intro survey shown before the calibration diagnostic.
 *
 * Two shapes are in play and it matters which one you're holding:
 *
 *   answer map -- `Record<questionId, string>`, what the form binds to. Every
 *                 value is a string because that's what inputs produce.
 *   features   -- the numeric/categorical vector the API is given
 *                 (`toSurveyFeatures`). Booleans are 1/0, frequencies are
 *                 0-100, counts are non-negative integers.
 *
 * The form, the request schema, and the feature vector are all derived from
 * the question list below, so adding a question in one place is enough.
 */
type BaseQuestion = {
  id: string;
  prompt: string;
  helper?: string;
  /**
   * Only ask this when another answer has a given value. Hidden questions are
   * neither rendered nor validated -- see `visibleQuestions`.
   */
  showWhen?: { id: string; equals: string };
};

/** A dropdown: the answer must be one of `options`. */
export type SelectQuestion = BaseQuestion & {
  type: "select";
  options: readonly string[];
};

/** A yes/no radio pair. Stored as "1"/"0", sent as 1/0. */
export type BooleanQuestion = BaseQuestion & {
  type: "boolean";
  yesLabel?: string;
  noLabel?: string;
};

/** A whole-number count, bounded so a typo can't poison the feature vector. */
export type IntegerQuestion = BaseQuestion & {
  type: "integer";
  min: number;
  max: number;
  unit: string;
};

/** A 0-100 "how often" slider. */
export type ScaleQuestion = BaseQuestion & {
  type: "scale";
  lowLabel: string;
  highLabel: string;
};

export type SurveyQuestion =
  | SelectQuestion
  | BooleanQuestion
  | IntegerQuestion
  | ScaleQuestion;

/**
 * Departments offered on the survey. Also the set an admin can pin to an
 * invitation, and the key set of DEPARTMENT_ATTACK_TYPES in
 * src/server/attackProfiles.ts -- all three must stay in sync.
 */
export const DEPARTMENTS = [
  "Customer Support",
  "Engineering",
  "Executive",
  "Finance",
  "HR",
  "IT",
  "Legal",
  "Marketing",
  "Operations",
  "Sales",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const WORK_MODES = ["Remote", "Hybrid", "Office"] as const;

export type WorkMode = (typeof WORK_MODES)[number];

export function isDepartment(value: unknown): value is Department {
  return typeof value === "string" && (DEPARTMENTS as readonly string[]).includes(value);
}

/**
 * Questions grouped into short themed pages. The grouping is purely for
 * pacing -- sixteen questions in one column reads as a chore -- and has no
 * bearing on the feature vector, which is assembled in a fixed order by
 * `toSurveyFeatures` regardless of how the questions were presented.
 */
export type SurveySection = {
  id: string;
  title: string;
  blurb: string;
  questions: SurveyQuestion[];
};

export const ONBOARDING_SURVEY_SECTIONS: SurveySection[] = [
  {
    id: "inbox",
    title: "Your inbox",
    blurb: "Rough numbers are fine — we only need the order of magnitude.",
    questions: [
      {
        id: "emails_per_day",
        type: "integer",
        prompt: "On average, how many emails do you get in a day?",
        min: 0,
        max: 1000,
        unit: "emails",
      },
      {
        id: "suspicious_emails_per_day",
        type: "integer",
        prompt: "On average, how many suspicious emails do you get in a day?",
        helper: "Anything that made you pause, whether or not it turned out to be real.",
        min: 0,
        max: 1000,
        unit: "emails",
      },
    ],
  },
  {
    id: "credentials",
    title: "Passwords and sign-in",
    blurb: "Nobody sees your answers here but you — they only set your starting difficulty.",
    questions: [
      {
        id: "password_length",
        type: "integer",
        prompt: "What is your average password length?",
        helper: "Number of individual characters. A best guess is fine.",
        min: 1,
        max: 128,
        unit: "characters",
      },
      {
        id: "reuses_passwords",
        type: "boolean",
        prompt: "Do you reuse any passwords?",
      },
      {
        id: "uses_password_manager",
        type: "boolean",
        prompt: "Do you have a password manager?",
      },
      {
        id: "mfa_familiar",
        type: "boolean",
        prompt: "Are you familiar with Multi-Factor Authentication (MFA)?",
        helper: "A second step after your password — a code, a push notification, a security key.",
      },
      {
        id: "mfa_enabled",
        type: "boolean",
        prompt: "Do you have MFA enabled on most of your accounts?",
        // Asking someone who just said they don't know what MFA is whether
        // they've enabled it produces noise; the feature is forced to 0.
        showWhen: { id: "mfa_familiar", equals: "1" },
      },
      {
        id: "security_training",
        type: "boolean",
        prompt: "Have you completed cyber security training in the past?",
      },
    ],
  },
  {
    id: "habits",
    title: "How you handle messages",
    blurb: "Drag each slider to whatever feels honest. There are no wrong answers.",
    questions: [
      {
        id: "clicks_links",
        type: "scale",
        prompt: "How often do you click links that are sent to you?",
        lowLabel: "Never",
        highLabel: "Every time",
      },
      {
        id: "opens_attachments",
        type: "scale",
        prompt: "How often do you open sent attachments?",
        lowLabel: "Never",
        highLabel: "Every time",
      },
      {
        id: "verifies_links",
        type: "scale",
        prompt: "How often do you verify a link before clicking?",
        helper: "Hovering to check the destination, or opening the site yourself instead.",
        lowLabel: "Never",
        highLabel: "Every time",
      },
      {
        id: "reports_suspicious",
        type: "scale",
        prompt: "How often do you report suspicious emails?",
        lowLabel: "Never",
        highLabel: "Every time",
      },
    ],
  },
  {
    id: "protection",
    title: "Your setup",
    blurb: "What's already protecting the devices you read email on.",
    questions: [
      {
        id: "has_antivirus",
        type: "boolean",
        prompt: "Do you have an antivirus installed on your devices?",
      },
      {
        id: "uses_vpn",
        type: "boolean",
        prompt: "Do you use a VPN?",
      },
    ],
  },
  {
    id: "work",
    title: "About your work",
    blurb: "This is what lets us send you the attacks your team actually sees.",
    questions: [
      {
        id: "department",
        type: "select",
        prompt: "What department do you work in?",
        options: DEPARTMENTS,
      },
      {
        id: "work_mode",
        type: "select",
        prompt: "What is your current work mode?",
        options: WORK_MODES,
      },
    ],
  },
];

export const ONBOARDING_SURVEY_QUESTIONS: SurveyQuestion[] =
  ONBOARDING_SURVEY_SECTIONS.flatMap((section) => section.questions);

const QUESTIONS_BY_ID = new Map(ONBOARDING_SURVEY_QUESTIONS.map((q) => [q.id, q]));

export type OnboardingSurveyAnswerMap = Record<string, string>;

/**
 * The vector handed to the API. Field order is the survey's canonical order
 * and is independent of the order the questions were asked in.
 */
export type SurveyFeatures = {
  emails_per_day: number;
  suspicious_emails_per_day: number;
  password_length: number;
  reuses_passwords: number;
  uses_password_manager: number;
  mfa_familiar: number;
  mfa_enabled: number;
  security_training: number;
  clicks_links: number;
  opens_attachments: number;
  verifies_links: number;
  reports_suspicious: number;
  has_antivirus: number;
  uses_vpn: number;
  department: Department;
  work_mode: WorkMode;
};

/**
 * A department pinned to the org invitation the user accepted, if any. When
 * set, the department question is dropped from the survey and this value is
 * used instead -- the org already knows the answer.
 */
export type SurveyContext = { presetDepartment?: string | null };

function hasPresetDepartment(context?: SurveyContext): boolean {
  return isDepartment(context?.presetDepartment);
}

/** Which questions to ask, given what's been answered and what the org told us. */
export function visibleQuestions(
  draft: OnboardingSurveyAnswerMap,
  context?: SurveyContext,
): SurveyQuestion[] {
  return ONBOARDING_SURVEY_QUESTIONS.filter((q) => isVisible(q, draft, context));
}

/** The same filter applied section by section; sections left empty are dropped. */
export function visibleSections(
  draft: OnboardingSurveyAnswerMap,
  context?: SurveyContext,
): SurveySection[] {
  return ONBOARDING_SURVEY_SECTIONS.map((section) => ({
    ...section,
    questions: section.questions.filter((q) => isVisible(q, draft, context)),
  })).filter((section) => section.questions.length > 0);
}

function isVisible(
  question: SurveyQuestion,
  draft: OnboardingSurveyAnswerMap,
  context?: SurveyContext,
): boolean {
  if (question.id === "department" && hasPresetDepartment(context)) {
    return false;
  }
  const gate = question.showWhen;
  return !gate || draft[gate.id] === gate.equals;
}

/** Zod schema for one question's raw string answer. */
function schemaFor(question: SurveyQuestion): z.ZodTypeAny {
  switch (question.type) {
    case "select":
      return z.enum(question.options as unknown as [string, ...string[]], {
        errorMap: () => ({ message: "Pick one of the options." }),
      });
    case "boolean":
      return z.enum(["0", "1"], {
        errorMap: () => ({ message: "Pick yes or no." }),
      });
    case "integer":
      return z
        .string()
        .regex(/^\d+$/, "Enter a whole number.")
        .refine(
          (v) => Number(v) >= question.min && Number(v) <= question.max,
          `Enter a number between ${question.min} and ${question.max}.`,
        );
    case "scale":
      return z
        .string()
        .regex(/^\d+$/, "Move the slider to answer.")
        .refine((v) => Number(v) >= 0 && Number(v) <= 100, "Must be between 0 and 100.");
  }
}

/** Zod shape for the answer map, restricted to the questions actually asked. */
function surveyAnswersSchema(
  draft: OnboardingSurveyAnswerMap,
  context?: SurveyContext,
) {
  return z.object(
    Object.fromEntries(
      visibleQuestions(draft, context).map((q) => [q.id, schemaFor(q)]),
    ) as Record<string, z.ZodTypeAny>,
  );
}

/**
 * Validate a draft answer map. Returns per-question error messages keyed by
 * question id -- empty when the survey is ready to submit.
 */
export function validateSurveyAnswers(
  draft: OnboardingSurveyAnswerMap,
  context?: SurveyContext,
): Record<string, string> {
  const result = surveyAnswersSchema(draft, context).safeParse(stripEmpty(draft));
  if (result.success) {
    return {};
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !errors[key]) {
      errors[key] =
        issue.code === "invalid_type" ? requiredMessage(key) : issue.message;
    }
  }
  return errors;
}

function requiredMessage(questionId: string): string {
  const question = QUESTIONS_BY_ID.get(questionId);
  if (question?.type === "scale") return "Move the slider to answer.";
  if (question?.type === "integer") return "Enter a number.";
  return "This one's required.";
}

/** Drop blank answers so a missing question reads as absent, not empty. */
export function stripEmpty(
  draft: OnboardingSurveyAnswerMap,
): OnboardingSurveyAnswerMap {
  return Object.fromEntries(
    Object.entries(draft).filter(([, value]) => value.trim() !== ""),
  );
}

/**
 * Convert a validated answer map into the feature vector sent to the API.
 * Throws on an invalid draft -- callers validate first.
 */
export function toSurveyFeatures(
  draft: OnboardingSurveyAnswerMap,
  context?: SurveyContext,
): SurveyFeatures {
  const errors = validateSurveyAnswers(draft, context);
  const firstError = Object.keys(errors)[0];
  if (firstError) {
    throw new Error(`Survey answer for "${firstError}" is invalid: ${errors[firstError]}`);
  }

  const num = (id: string) => Number(draft[id]);
  const familiarWithMfa = draft.mfa_familiar === "1";

  return {
    emails_per_day: num("emails_per_day"),
    suspicious_emails_per_day: num("suspicious_emails_per_day"),
    password_length: num("password_length"),
    reuses_passwords: num("reuses_passwords"),
    uses_password_manager: num("uses_password_manager"),
    mfa_familiar: familiarWithMfa ? 1 : 0,
    // Not familiar with MFA means not using it, whether or not we asked.
    mfa_enabled: familiarWithMfa ? num("mfa_enabled") : 0,
    security_training: num("security_training"),
    clicks_links: num("clicks_links"),
    opens_attachments: num("opens_attachments"),
    verifies_links: num("verifies_links"),
    reports_suspicious: num("reports_suspicious"),
    has_antivirus: num("has_antivirus"),
    uses_vpn: num("uses_vpn"),
    // Both are safe casts: validateSurveyAnswers above already checked the
    // answer against the enum, and hasPresetDepartment checks the preset.
    department: (hasPresetDepartment(context)
      ? context!.presetDepartment
      : draft.department) as Department,
    work_mode: draft.work_mode as WorkMode,
  };
}
