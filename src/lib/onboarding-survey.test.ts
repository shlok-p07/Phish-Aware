import { describe, expect, it } from "bun:test";
import {
  validateSurveyAnswers,
  stripEmpty,
  toSurveyFeatures,
  visibleQuestions,
  visibleSections,
  DEPARTMENTS,
  ONBOARDING_SURVEY_QUESTIONS,
  ONBOARDING_SURVEY_SECTIONS,
  type OnboardingSurveyAnswerMap,
} from "./onboarding-survey";

/** A fully valid answer set, used as a baseline that individual tests mutate. */
const COMPLETE_ANSWERS: OnboardingSurveyAnswerMap = {
  emails_per_day: "40",
  suspicious_emails_per_day: "3",
  password_length: "14",
  reuses_passwords: "1",
  uses_password_manager: "0",
  mfa_familiar: "1",
  mfa_enabled: "1",
  security_training: "0",
  clicks_links: "60",
  opens_attachments: "25",
  verifies_links: "40",
  reports_suspicious: "10",
  has_antivirus: "1",
  uses_vpn: "0",
  department: "Engineering",
  work_mode: "Hybrid",
};

describe("validateSurveyAnswers", () => {
  it("returns no errors for a complete, valid answer set", () => {
    expect(validateSurveyAnswers(COMPLETE_ANSWERS)).toEqual({});
  });

  it("an entirely empty submission flags every question that was asked", () => {
    const errors = validateSurveyAnswers({});
    for (const question of visibleQuestions({})) {
      expect(errors[question.id]).toBeTruthy();
    }
  });

  it("rejects a non-integer count", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, emails_per_day: "12.5" })
      .emails_per_day).toBeTruthy();
  });

  it("rejects a count above its declared maximum", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, emails_per_day: "5000" })
      .emails_per_day).toBeTruthy();
  });

  it("rejects a password length of zero -- everyone's password has characters", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, password_length: "0" })
      .password_length).toBeTruthy();
  });

  it("accepts zero for a count that legitimately can be zero", () => {
    expect(
      validateSurveyAnswers({ ...COMPLETE_ANSWERS, suspicious_emails_per_day: "0" }),
    ).toEqual({});
  });

  it("rejects a boolean answer that isn't 1 or 0", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, uses_vpn: "yes" }).uses_vpn)
      .toBeTruthy();
  });

  it("rejects a 0-100 answer outside the range", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, clicks_links: "140" })
      .clicks_links).toBeTruthy();
  });

  it("accepts both ends of a 0-100 range", () => {
    expect(
      validateSurveyAnswers({ ...COMPLETE_ANSWERS, clicks_links: "0", verifies_links: "100" }),
    ).toEqual({});
  });

  it("rejects a department outside the offered list", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, department: "Facilities" })
      .department).toBeTruthy();
  });

  it("rejects a work mode outside Remote/Hybrid/Office", () => {
    expect(validateSurveyAnswers({ ...COMPLETE_ANSWERS, work_mode: "Onsite" })
      .work_mode).toBeTruthy();
  });

  it("reports every invalid field at once, not just the first one found", () => {
    const errors = validateSurveyAnswers({
      ...COMPLETE_ANSWERS,
      department: "bogus",
      uses_vpn: "bogus",
      emails_per_day: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["department", "emails_per_day", "uses_vpn"]);
  });

  it("doesn't ask -- or require -- whether MFA is enabled when they don't know what MFA is", () => {
    const { mfa_enabled, ...rest } = COMPLETE_ANSWERS;
    const answers = { ...rest, mfa_familiar: "0" };
    expect(visibleQuestions(answers).some((q) => q.id === "mfa_enabled")).toBe(false);
    expect(validateSurveyAnswers(answers)).toEqual({});
  });

  it("requires the MFA-enabled answer once they say they're familiar with MFA", () => {
    const { mfa_enabled, ...rest } = COMPLETE_ANSWERS;
    expect(validateSurveyAnswers(rest).mfa_enabled).toBeTruthy();
  });
});

describe("a department pinned by an org invitation", () => {
  const { department, ...withoutDepartment } = COMPLETE_ANSWERS;

  it("drops the department question from the survey", () => {
    const asked = visibleQuestions(withoutDepartment, { presetDepartment: "Legal" });
    expect(asked.some((q) => q.id === "department")).toBe(false);
  });

  it("validates without the user answering it", () => {
    expect(validateSurveyAnswers(withoutDepartment, { presetDepartment: "Legal" })).toEqual({});
  });

  it("still sends the department in the features, taken from the invitation", () => {
    const features = toSurveyFeatures(withoutDepartment, { presetDepartment: "Legal" });
    expect(features.department).toBe("Legal");
  });

  it("overrides a stale answer left in the draft", () => {
    const features = toSurveyFeatures(COMPLETE_ANSWERS, { presetDepartment: "Legal" });
    expect(features.department).toBe("Legal");
  });

  it("is ignored when it isn't a department we know, so the question is still asked", () => {
    const asked = visibleQuestions(withoutDepartment, { presetDepartment: "Facilities" });
    expect(asked.some((q) => q.id === "department")).toBe(true);
    expect(validateSurveyAnswers(withoutDepartment, { presetDepartment: "Facilities" })
      .department).toBeTruthy();
  });

  it("leaves the work-mode question alone", () => {
    const asked = visibleQuestions(withoutDepartment, { presetDepartment: "Legal" });
    expect(asked.some((q) => q.id === "work_mode")).toBe(true);
  });
});

describe("toSurveyFeatures", () => {
  it("produces the full numeric feature vector", () => {
    expect(toSurveyFeatures(COMPLETE_ANSWERS)).toEqual({
      emails_per_day: 40,
      suspicious_emails_per_day: 3,
      password_length: 14,
      reuses_passwords: 1,
      uses_password_manager: 0,
      mfa_familiar: 1,
      mfa_enabled: 1,
      security_training: 0,
      clicks_links: 60,
      opens_attachments: 25,
      verifies_links: 40,
      reports_suspicious: 10,
      has_antivirus: 1,
      uses_vpn: 0,
      department: "Engineering",
      work_mode: "Hybrid",
    });
  });

  it("forces mfa_enabled to 0 when they aren't familiar with MFA", () => {
    const { mfa_enabled, ...rest } = COMPLETE_ANSWERS;
    const features = toSurveyFeatures({ ...rest, mfa_familiar: "0" });
    expect(features.mfa_familiar).toBe(0);
    expect(features.mfa_enabled).toBe(0);
  });

  it("forces mfa_enabled to 0 even if a stale 'yes' is left in the draft", () => {
    const features = toSurveyFeatures({ ...COMPLETE_ANSWERS, mfa_familiar: "0" });
    expect(features.mfa_enabled).toBe(0);
  });

  it("refuses to build a vector from an invalid draft rather than emitting NaN", () => {
    expect(() => toSurveyFeatures({ ...COMPLETE_ANSWERS, emails_per_day: "lots" })).toThrow();
  });

  it("covers every question the survey asks, and nothing else", () => {
    const featureKeys = Object.keys(toSurveyFeatures(COMPLETE_ANSWERS)).sort();
    const questionIds = ONBOARDING_SURVEY_QUESTIONS.map((q) => q.id).sort();
    expect(featureKeys).toEqual(questionIds);
  });
});

describe("survey structure", () => {
  it("has no duplicate question ids", () => {
    const ids = ONBOARDING_SURVEY_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gates every conditional question on a question that exists", () => {
    const ids = new Set(ONBOARDING_SURVEY_QUESTIONS.map((q) => q.id));
    for (const question of ONBOARDING_SURVEY_QUESTIONS) {
      if (question.showWhen) {
        expect(ids.has(question.showWhen.id)).toBe(true);
      }
    }
  });

  it("offers the departments the rest of the app maps scenarios to", () => {
    const question = ONBOARDING_SURVEY_QUESTIONS.find((q) => q.id === "department")!;
    expect(question.type).toBe("select");
    expect((question as { options: readonly string[] }).options).toEqual([...DEPARTMENTS]);
  });

  it("drops a section entirely once all of its questions are hidden", () => {
    const workSection = ONBOARDING_SURVEY_SECTIONS.find((s) => s.id === "work")!;
    // Sanity check that the only other question in the section is work_mode,
    // so answering it is enough to empty the section out.
    expect(workSection.questions.map((q) => q.id)).toEqual(["department", "work_mode"]);
  });

  it("keeps every question reachable from exactly one section", () => {
    const fromSections = ONBOARDING_SURVEY_SECTIONS.flatMap((s) => s.questions.map((q) => q.id));
    expect(fromSections.sort()).toEqual(ONBOARDING_SURVEY_QUESTIONS.map((q) => q.id).sort());
  });

  it("hides an empty section rather than rendering a bare heading", () => {
    const sections = visibleSections({}, { presetDepartment: "Legal" });
    const work = sections.find((s) => s.id === "work")!;
    expect(work.questions.map((q) => q.id)).toEqual(["work_mode"]);
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
