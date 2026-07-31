import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { OnboardingSurvey } from "./onboarding-survey";
import {
  ONBOARDING_SURVEY_QUESTIONS,
  type OnboardingSurveyAnswerMap,
} from "@/lib/onboarding-survey";

/**
 * Answers for everything the form can drive without Radix's pointer-based
 * widgets (Select and Slider need real layout, which happy-dom doesn't give
 * us). Passed in as initialAnswers so tests can interact with the one or two
 * questions they actually care about.
 */
const PREFILLED: OnboardingSurveyAnswerMap = {
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

let completedWith: OnboardingSurveyAnswerMap | null = null;

function renderSurvey(props: Partial<React.ComponentProps<typeof OnboardingSurvey>> = {}) {
  return render(
    <OnboardingSurvey onComplete={(answers) => (completedWith = answers)} {...props} />,
  );
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /Continue to diagnostic/i }));

/** Yes/No labels repeat across the form, so scope the query to one question. */
function answerYesNo(questionId: string, label: "Yes" | "No") {
  const field = document.getElementById(`question-${questionId}`)!;
  fireEvent.click(within(field).getByRole("radio", { name: label }));
}

beforeEach(() => {
  completedWith = null;
});

afterEach(() => {
  cleanup();
});

describe("OnboardingSurvey", () => {
  it("asks every question in the survey", () => {
    renderSurvey();
    for (const question of ONBOARDING_SURVEY_QUESTIONS) {
      if (question.id === "mfa_enabled") continue; // conditional -- covered below
      expect(screen.getByText(question.prompt)).toBeTruthy();
    }
  });

  it("groups the questions under section headings rather than one flat list", () => {
    renderSurvey();
    expect(screen.getByText("Your inbox")).toBeTruthy();
    expect(screen.getByText("Passwords and sign-in")).toBeTruthy();
    expect(screen.getByText("About your work")).toBeTruthy();
  });

  it("numbers questions continuously across sections", () => {
    renderSurvey();
    // 15 asked up front: 16 questions less the hidden MFA-enabled follow-up.
    expect(screen.getByText("15.")).toBeTruthy();
    expect(screen.queryByText("16.")).toBeNull();
  });

  it("won't submit an unfinished survey, and says which question is missing", () => {
    const { emails_per_day, ...rest } = PREFILLED;
    renderSurvey({ initialAnswers: rest });
    submit();
    expect(completedWith).toBeNull();
    expect(screen.getByText("Enter a number.")).toBeTruthy();
  });

  it("submits once every question is answered", () => {
    renderSurvey({ initialAnswers: PREFILLED });
    submit();
    expect(completedWith).toEqual(PREFILLED);
  });

  it("tracks how many questions are answered", () => {
    const { emails_per_day, uses_vpn, ...rest } = PREFILLED;
    renderSurvey({ initialAnswers: rest });
    expect(screen.getByText("14 of 16 answered")).toBeTruthy();
  });

  it("counts only the questions actually asked", () => {
    // mfa_familiar answered "no" hides its follow-up, so the denominator drops.
    const { mfa_enabled, ...rest } = PREFILLED;
    renderSurvey({ initialAnswers: { ...rest, mfa_familiar: "0" } });
    expect(screen.getByText("15 of 15 answered")).toBeTruthy();
  });

  it("clears a question's error as soon as it's answered again", () => {
    const { emails_per_day, ...rest } = PREFILLED;
    renderSurvey({ initialAnswers: rest });
    submit();
    expect(screen.getByText("Enter a number.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/how many emails do you get in a day/i), {
      target: { value: "30" },
    });
    expect(screen.queryByText("Enter a number.")).toBeNull();
  });

  it("keeps non-digits out of a count, so the feature vector can't get an unparseable answer", () => {
    renderSurvey({ initialAnswers: PREFILLED });
    const field = screen.getByLabelText(/how many emails do you get in a day/i) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1e5" } });
    submit();
    expect(completedWith?.emails_per_day).toBe("15");
  });

  it("records a yes/no answer as 1/0", () => {
    const { uses_vpn, has_antivirus, ...rest } = PREFILLED;
    renderSurvey({ initialAnswers: rest });
    answerYesNo("uses_vpn", "No");
    answerYesNo("has_antivirus", "Yes");
    submit();
    expect(completedWith?.uses_vpn).toBe("0");
    expect(completedWith?.has_antivirus).toBe("1");
  });

  describe("the MFA follow-up", () => {
    it("isn't asked until they say they know what MFA is", () => {
      const { mfa_familiar, mfa_enabled, ...rest } = PREFILLED;
      renderSurvey({ initialAnswers: rest });
      expect(screen.queryByText(/enabled on most of your accounts/i)).toBeNull();
    });

    it("appears once they say they're familiar with MFA", () => {
      const { mfa_familiar, mfa_enabled, ...rest } = PREFILLED;
      renderSurvey({ initialAnswers: rest });

      answerYesNo("mfa_familiar", "Yes");
      expect(screen.getByText(/enabled on most of your accounts/i)).toBeTruthy();
    });

    it("disappears again if they change their mind about being familiar with MFA", () => {
      renderSurvey({ initialAnswers: PREFILLED });
      expect(screen.getByText(/enabled on most of your accounts/i)).toBeTruthy();

      answerYesNo("mfa_familiar", "No");
      expect(screen.queryByText(/enabled on most of your accounts/i)).toBeNull();
    });

    it("submits without it when they aren't familiar with MFA", () => {
      const { mfa_enabled, ...rest } = PREFILLED;
      renderSurvey({ initialAnswers: { ...rest, mfa_familiar: "0" } });
      submit();
      expect(completedWith).toBeTruthy();
      expect(completedWith?.mfa_enabled).toBeUndefined();
    });
  });

  describe("with a department pinned by the org invitation", () => {
    it("doesn't ask for the department", () => {
      renderSurvey({ presetDepartment: "Legal", initialAnswers: PREFILLED });
      expect(screen.queryByText(/What department do you work in/i)).toBeNull();
    });

    it("still asks for the work mode", () => {
      renderSurvey({ presetDepartment: "Legal", initialAnswers: PREFILLED });
      expect(screen.getByText(/What is your current work mode/i)).toBeTruthy();
    });

    it("submits without the user ever answering the department question", () => {
      const { department, ...rest } = PREFILLED;
      renderSurvey({ presetDepartment: "Legal", initialAnswers: rest });
      submit();
      expect(completedWith).toEqual(rest);
    });
  });
});
