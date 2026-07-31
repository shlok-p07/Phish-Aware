import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installApiClientMock, apiClientMockState, resetApiClientMockState } from "@/test/mock-api-client";

installApiClientMock();

const FAKE_QUESTIONS = [
  { id: "q1", vector: "email" as const, sender: "IT <it@corp.com>", subject: "Q1 subject", body: "Q1 body", links: [] },
  { id: "q2", vector: "email" as const, sender: "HR <hr@corp.com>", subject: "Q2 subject", body: "Q2 body", links: [] },
];

const STUB_SURVEY_ANSWERS = {
  role: "Student",
  department: "IT",
  work_type: "Remote",
  age_range: "25-34",
  email_volume: "10–25",
  confidence: "Somewhat confident",
  prior_training: "No",
  goal: "Stop clicking bad links",
};

// The real OnboardingSurvey's own validation/rendering is already covered by
// src/lib/onboarding-survey.test.ts -- this stub isolates the onboarding
// *page's* own back-and-forth/state logic, which is what this file tests.
mock.module("@/components/onboarding-survey", () => ({
  OnboardingSurvey: ({
    onComplete,
    initialAnswers,
  }: {
    onComplete: (answers: typeof STUB_SURVEY_ANSWERS) => void;
    initialAnswers?: Partial<typeof STUB_SURVEY_ANSWERS>;
  }) => (
    <div>
      <div data-testid="survey-department-value">{initialAnswers?.department ?? "(empty)"}</div>
      <button onClick={() => onComplete(STUB_SURVEY_ANSWERS)}>Continue to diagnostic (stub)</button>
    </div>
  ),
}));

let submittedPayloads: unknown[] = [];

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

mock.module("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => {} }),
}));

const { default: OnboardingPage } = await import("./page");

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingPage />
    </QueryClientProvider>,
  );
}

function completeSurvey() {
  fireEvent.click(screen.getByRole("button", { name: /Continue to diagnostic \(stub\)/i }));
}

beforeEach(() => {
  resetApiClientMockState();
  submittedPayloads = [];
  apiClientMockState.onboardingQuizQuestions = FAKE_QUESTIONS;
  apiClientMockState.currentUser = { onboardingCompleted: false };
  apiClientMockState.submitOnboardingQuiz = (payload, handlers) => {
    submittedPayloads.push(payload);
    handlers.onSuccess?.({ level: "beginner", correctCount: 1, totalCount: 2 });
  };
});

afterEach(() => {
  cleanup();
});

describe("Onboarding page", () => {
  it("shows the survey step first, with no pre-filled answers", () => {
    renderPage();
    expect(screen.getByTestId("survey-department-value").textContent).toBe("(empty)");
  });

  it("moves to the quiz after the survey completes", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  });

  it("answering advances to the next question", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    expect(screen.getByText("Q2 subject")).toBeTruthy();
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
  });

  it("Back to previous question un-answers and returns to the exact prior question", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    expect(screen.getByText("Q2 subject")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Back to previous question/i }));
    expect(screen.getByText("Q1 subject")).toBeTruthy();
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  });

  it("has no 'back to previous question' option on the very first question", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());
    expect(screen.queryByText(/Back to previous question/i)).toBeNull();
  });

  it("Back to survey answers returns to the survey with previous answers preserved", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Back to survey answers/i }));

    // Survey re-shown with the previously-entered department, not wiped.
    expect(screen.getByTestId("survey-department-value").textContent).toBe("IT");
  });

  it("resuming from the survey returns to the quiz without losing prior progress", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    expect(screen.getByText("Q2 subject")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Back to previous question/i }));
    expect(screen.getByText("Q1 subject")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Back to survey answers/i }));
    completeSurvey();

    // Still on question 1 -- going to the survey and back didn't reset quiz progress.
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  });

  it("submits department/workType/ageRange from the survey alongside the quiz answers", async () => {
    renderPage();
    completeSurvey();
    await waitFor(() => expect(screen.getByText("Q1 subject")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Phishing/i })); // Q1 -> Q2
    fireEvent.click(screen.getByRole("button", { name: /Legitimate/i })); // Q2 -> submits

    expect(submittedPayloads).toHaveLength(1);
    expect(submittedPayloads[0]).toMatchObject({
      data: {
        department: "IT",
        workType: "Remote",
        ageRange: "25-34",
        answers: [
          { scenarioId: "q1", verdict: true },
          { scenarioId: "q2", verdict: false },
        ],
      },
    });
  });
});
