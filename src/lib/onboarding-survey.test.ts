import { describe, expect, it } from "bun:test";
import {
  validateSurveyAnswers,
  stripEmpty,
  ONBOARDING_SURVEY_QUESTIONS,
  type OnboardingSurveyAnswerMap,
} from "./onboarding-survey";

/** A fully valid answer set, used as a baseline that individual tests mutate. */
const COMPLETE_ANSWERS: OnboardingSurveyAnswerMap = {
  role: "Student",
  department: "IT",
  work_type: "Remote",
  age_range: "25-34",
  email_volume: "10–25",
  confidence: "Somewhat confident",
  prior_training: "No",
  goal: "Stop clicking suspicious links",
  // recent_encounter deliberately omitted -- it's optional
};

describe("validateSurveyAnswers", () => {
  it("returns no errors for a complete, valid answer set", () => {
    expect(validateSurveyAnswers(COMPLETE_ANSWERS)).toEqual({});
  });

  it("flags each required field (department, work_type, age_range) as missing when absent", () => {
    const { department, work_type, age_range, ...rest } = COMPLETE_ANSWERS;
    const errors = validateSurveyAnswers(rest);
    expect(Object.keys(errors)).toContain("department");
    expect(Object.keys(errors)).toContain("work_type");
    expect(Object.keys(errors)).toContain("age_range");
  });

  it("rejects a department value that isn't one of the real options", () => {
    const errors = validateSurveyAnswers({ ...COMPLETE_ANSWERS, department: "Marketing" });
    expect(errors.department).toBeTruthy();
  });

  it("rejects a work_type value outside Remote/Hybrid/Onsite", () => {
    const errors = validateSurveyAnswers({ ...COMPLETE_ANSWERS, work_type: "From the moon" });
    expect(errors.work_type).toBeTruthy();
  });

  it("rejects an age_range value that isn't one of the real buckets", () => {
    const errors = validateSurveyAnswers({ ...COMPLETE_ANSWERS, age_range: "16" });
    expect(errors.age_range).toBeTruthy();
  });

  it("does not require the optional recent_encounter field", () => {
    const errors = validateSurveyAnswers(COMPLETE_ANSWERS);
    expect(errors.recent_encounter).toBeUndefined();
  });

  it("accepts recent_encounter when it is provided", () => {
    const errors = validateSurveyAnswers({
      ...COMPLETE_ANSWERS,
      recent_encounter: "Got an email claiming to be from IT asking for my password.",
    });
    expect(errors.recent_encounter).toBeUndefined();
  });

  it("rejects a required free-text field left blank", () => {
    const errors = validateSurveyAnswers({ ...COMPLETE_ANSWERS, goal: "" });
    expect(errors.goal).toBeTruthy();
  });

  it("rejects a required free-text field that is only whitespace", () => {
    const errors = validateSurveyAnswers({ ...COMPLETE_ANSWERS, goal: "   " });
    expect(errors.goal).toBeTruthy();
  });

  it("rejects free text over its declared maxLength", () => {
    const goalQuestion = ONBOARDING_SURVEY_QUESTIONS.find((q) => q.id === "goal")!;
    const tooLong = "x".repeat((goalQuestion as { maxLength: number }).maxLength + 1);
    const errors = validateSurveyAnswers({ ...COMPLETE_ANSWERS, goal: tooLong });
    expect(errors.goal).toBeTruthy();
  });

  it("reports every invalid field at once, not just the first one found", () => {
    const errors = validateSurveyAnswers({
      ...COMPLETE_ANSWERS,
      department: "bogus",
      work_type: "bogus",
      goal: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["department", "goal", "work_type"]);
  });

  it("an entirely empty submission flags every required question", () => {
    const requiredIds = ONBOARDING_SURVEY_QUESTIONS.filter((q) => q.required).map((q) => q.id);
    const errors = validateSurveyAnswers({});
    for (const id of requiredIds) {
      expect(errors[id]).toBeTruthy();
    }
  });
});

describe("stripEmpty", () => {
  it("removes keys whose value is an empty string", () => {
    expect(stripEmpty({ a: "value", b: "" })).toEqual({ a: "value" });
  });

  it("removes keys whose value is only whitespace", () => {
    expect(stripEmpty({ a: "value", b: "   " })).toEqual({ a: "value" });
  });

  it("keeps non-empty values untouched, including surrounding whitespace", () => {
    expect(stripEmpty({ a: "  value  " })).toEqual({ a: "  value  " });
  });

  it("returns an empty object when given an empty object", () => {
    expect(stripEmpty({})).toEqual({});
  });
});
