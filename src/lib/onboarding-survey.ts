import { z } from "zod";

/**
 * The intro survey shown before the calibration diagnostic. Questions are
 * placeholders for now — edit this list and the client/server stay in sync,
 * since both the form and the request schema are derived from it.
 */
type BaseQuestion = {
  id: string;
  prompt: string;
  helper?: string;
  required: boolean;
};

/** A dropdown or radio group: the answer must be one of `options`. */
export type ChoiceQuestion = BaseQuestion & {
  type: "select" | "radio";
  options: string[];
};

/** A single-line or multi-line free-text answer. */
export type TextQuestion = BaseQuestion & {
  type: "text" | "textarea";
  placeholder?: string;
  maxLength: number;
};

export type SurveyQuestion = ChoiceQuestion | TextQuestion;

export function isChoiceQuestion(q: SurveyQuestion): q is ChoiceQuestion {
  return q.type === "select" || q.type === "radio";
}

export const ONBOARDING_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "role",
    type: "select",
    prompt: "Which best describes you?",
    required: true,
    options: [
      "Student",
      "Faculty or staff",
      "IT or security professional",
      "Other",
    ],
  },
  {
    id: "department",
    type: "select",
    prompt: "Which department are you in?",
    helper: "This lets us tailor scenarios to attacks your team actually sees.",
    required: true,
    options: ["IT", "Finance", "HR", "Management", "Engineering", "Sales", "Operations", "Other"],
  },
  {
    id: "work_type",
    type: "select",
    prompt: "How do you mostly work?",
    required: true,
    options: ["Remote", "Hybrid", "Onsite"],
  },
  {
    id: "age_range",
    type: "select",
    prompt: "What's your age range?",
    required: true,
    options: ["18-24", "25-34", "35-44", "45-54", "55+"],
  },
  {
    id: "email_volume",
    type: "select",
    prompt: "How many emails do you read on a typical day?",
    required: true,
    options: ["Fewer than 10", "10–25", "26–50", "More than 50"],
  },
  {
    id: "confidence",
    type: "radio",
    prompt: "How confident are you at spotting a phishing message today?",
    helper: "There's no wrong answer — this only sets your starting point.",
    required: true,
    options: ["Not confident", "Somewhat confident", "Very confident"],
  },
  {
    id: "prior_training",
    type: "radio",
    prompt: "Have you had security awareness training before?",
    required: true,
    options: ["Yes", "No", "Not sure"],
  },
  {
    id: "goal",
    type: "text",
    prompt: "What do you most want to get out of PhishAware?",
    required: true,
    placeholder: "e.g. stop second-guessing every invoice email",
    maxLength: 200,
  },
  {
    id: "recent_encounter",
    type: "textarea",
    prompt: "Describe a suspicious message you've received recently.",
    helper: "Optional — skip it if nothing comes to mind.",
    required: false,
    placeholder: "What was it asking you to do? What tipped you off?",
    maxLength: 1000,
  },
];

/** Zod shape for the answer map, built from the question list above. */
export const OnboardingSurveyAnswers = z.object(
  Object.fromEntries(
    ONBOARDING_SURVEY_QUESTIONS.map((q) => {
      if (isChoiceQuestion(q)) {
        const choice = z.enum(q.options as [string, ...string[]], {
          errorMap: () => ({ message: "Pick one of the options." }),
        });
        return [q.id, q.required ? choice : choice.optional()];
      }
      const freeText = z
        .string()
        .trim()
        .max(q.maxLength, `Keep this under ${q.maxLength} characters.`);
      return [
        q.id,
        q.required ? freeText.min(1, "This one's required.") : freeText.optional(),
      ];
    }),
  ) as Record<string, z.ZodTypeAny>,
);

export type OnboardingSurveyAnswerMap = Record<string, string>;

/**
 * Validate a draft answer map. Returns per-question error messages keyed by
 * question id — empty when the survey is ready to submit.
 */
export function validateSurveyAnswers(
  draft: OnboardingSurveyAnswerMap,
): Record<string, string> {
  const result = OnboardingSurveyAnswers.safeParse(stripEmpty(draft));
  if (result.success) {
    return {};
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

/** Drop blank answers so optional questions validate as absent, not empty. */
export function stripEmpty(
  draft: OnboardingSurveyAnswerMap,
): OnboardingSurveyAnswerMap {
  return Object.fromEntries(
    Object.entries(draft).filter(([, value]) => value.trim() !== ""),
  );
}
