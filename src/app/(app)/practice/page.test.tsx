import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installApiClientMock, apiClientMockState, resetApiClientMockState } from "@/test/mock-api-client";
import { ChatbotProvider } from "@/components/chatbot-widget";

installApiClientMock();

const FAKE_SCENARIO = {
  id: "scenario-1",
  vector: "email",
  sender: "IT Security <it-support@accounts-verify-portal.com>",
  subject: "Action required: verify your account",
  body: "We detected unusual sign-in activity. Click below to confirm your identity.",
  links: [],
  attachments: [],
  difficulty: 3,
};

const FAKE_CUES = [
  { id: "sender_domain", label: "Mismatched sender domain" },
  { id: "urgency_language", label: "Urgency or pressure to act fast" },
];

// Tracks every payload passed to the submit mutation, so tests can assert on
// exactly what the "Submit Verdict" button sent without a real network call.
let submittedPayloads: unknown[] = [];
let submitShouldSucceed = true;

const FAKE_RESULT = {
  correct: true,
  correctVerdict: true,
  explanation: "This is a classic credential-harvesting attempt.",
  caughtCues: ["urgency_language"],
  missedCues: ["sender_domain"],
  falseCues: [],
  calibrationNote: "Your confidence matched your accuracy well.",
  xpAwarded: 15,
  level: "beginner",
  leveledUp: false,
};

const { default: PracticePage } = await import("./page");

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatbotProvider>
        <PracticePage />
      </ChatbotProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetApiClientMockState();
  submittedPayloads = [];
  submitShouldSucceed = true;
  apiClientMockState.nextPracticeScenario = FAKE_SCENARIO;
  apiClientMockState.cueOptions = FAKE_CUES;
  apiClientMockState.submitAttempt = (payload, handlers) => {
    submittedPayloads.push(payload);
    if (submitShouldSucceed) {
      handlers.onSuccess?.(FAKE_RESULT);
    } else {
      handlers.onError?.(new Error("submit failed"));
    }
  };
});

afterEach(() => {
  cleanup();
});

describe("Practice page", () => {
  it("shows the verdict prompt on first load", () => {
    renderPage();
    expect(screen.getByText("Is this Phishing or Legitimate?")).toBeTruthy();
  });

  it("moves to the cues step after picking a verdict", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    expect(screen.getByText("What gave it away?")).toBeTruthy();
  });

  it("lets you undo the verdict from the cues step and pick again", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    expect(screen.getByText("What gave it away?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Back, change my verdict/i }));
    // Back on the verdict prompt, not stuck mid-flow.
    expect(screen.getByText("Is this Phishing or Legitimate?")).toBeTruthy();

    // Can now pick the other verdict cleanly -- confirms state was actually reset.
    fireEvent.click(screen.getByRole("button", { name: /Legitimate/i }));
    expect(screen.getByText("How confident are you?")).toBeTruthy();
  });

  it("does not carry selected cues across an undo", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mismatched sender domain" }));

    fireEvent.click(screen.getByRole("button", { name: /Back, change my verdict/i }));
    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));

    // Re-entering cues after the undo, the previously-selected cue should
    // no longer show as selected (selectedCues was cleared). Checking the
    // exact selected-only marker, since "border-primary" alone is also a
    // substring of the unselected state's "hover:border-primary/50".
    const cueButton = screen.getByRole("button", { name: "Mismatched sender domain" });
    expect(cueButton.className).not.toContain("scale-[1.02]");
  });

  it("confidence step's Back button returns to cues, not all the way to inspect", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mismatched sender domain" }));
    fireEvent.click(screen.getByRole("button", { name: /^Next/i }));
    expect(screen.getByText("How confident are you?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByText("What gave it away?")).toBeTruthy();
    // The cue picked before moving forward is still selected.
    const cueButton = screen.getByRole("button", { name: "Mismatched sender domain" });
    expect(cueButton.className).toContain("scale-[1.02]");
  });

  it("submits the verdict, cues, and confidence exactly as chosen", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Phishing/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mismatched sender domain" }));
    fireEvent.click(screen.getByRole("button", { name: /^Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit Verdict/i }));

    expect(submittedPayloads).toHaveLength(1);
    expect(submittedPayloads[0]).toMatchObject({
      data: {
        scenarioId: "scenario-1",
        verdict: true,
        selectedCues: ["sender_domain"],
        confidence: 50,
      },
    });
  });

  it("shows the feedback dialog with the real result after a successful submit", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Legitimate/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit Verdict/i }));

    await waitFor(() => expect(screen.getByText("Correct")).toBeTruthy());
    expect(screen.getByText(/classic credential-harvesting attempt/)).toBeTruthy();
    expect(screen.getByText("+15")).toBeTruthy();
  });

  it("does not show feedback if the submission fails", () => {
    submitShouldSucceed = false;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Legitimate/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit Verdict/i }));

    expect(screen.queryByText("Correct")).toBeNull();
    expect(screen.queryByText("Incorrect")).toBeNull();
  });
});
