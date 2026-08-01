import { describe, expect, it, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { installApiClientMock, apiClientMockState, resetApiClientMockState } from "@/test/mock-api-client";

installApiClientMock();

const { ChatbotProvider, useChatbot } = await import("./chatbot-widget");

afterEach(() => {
  cleanup();
  resetApiClientMockState();
});

function Harness() {
  const { askAbout } = useChatbot();
  return <button onClick={() => askAbout("Why was this a phish?")}>Ask from page</button>;
}

function renderWidget() {
  return render(
    <ChatbotProvider>
      <Harness />
    </ChatbotProvider>,
  );
}

describe("ChatbotWidget", () => {
  it("is closed by default and shows the launcher button", () => {
    renderWidget();
    expect(screen.queryByText("PhishAware Assistant", { selector: "p" })).toBeNull();
    expect(screen.getByLabelText(/Open PhishAware Assistant/i)).toBeTruthy();
  });

  it("opens the panel with a greeting when the launcher is clicked", () => {
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));
    expect(screen.getByText("PhishAware Assistant", { selector: "p" })).toBeTruthy();
    expect(screen.getByText(/Ask me about a red flag/)).toBeTruthy();
  });

  it("sends a typed message and renders the assistant's reply", async () => {
    apiClientMockState.sendChatbotMessage = (_payload, handlers) => {
      handlers.onSuccess?.({ reply: "Because the sender domain was spoofed." });
    };
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Why was the link suspicious?" } });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(screen.getByText("Why was the link suspicious?")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Because the sender domain was spoofed.")).toBeTruthy();
    });
  });

  it("shows a fallback message when the assistant call fails", async () => {
    apiClientMockState.sendChatbotMessage = (_payload, handlers) => {
      handlers.onError?.(new Error("network down"));
    };
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/couldn't reach the assistant/i)).toBeTruthy();
    });
  });

  it("askAbout() from another component opens the widget and sends the seeded prompt immediately", () => {
    apiClientMockState.sendChatbotMessage = (_payload, handlers) => {
      handlers.onSuccess?.({ reply: "Sure, let's break it down." });
    };
    renderWidget();

    fireEvent.click(screen.getByText("Ask from page"));

    expect(screen.getByText("PhishAware Assistant", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Why was this a phish?")).toBeTruthy();
  });

  it("does not send an empty or whitespace-only message", () => {
    let callCount = 0;
    apiClientMockState.sendChatbotMessage = () => {
      callCount++;
    };
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "   " } });
    expect((screen.getByLabelText("Send") as HTMLButtonElement).disabled).toBe(true);
    expect(callCount).toBe(0);
  });

  it("greets the signed-in user by their first name", () => {
    apiClientMockState.currentUser = { id: "u1", name: "Alex Rivera" };
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));
    expect(screen.getByText(/Hi, Alex\./)).toBeTruthy();
  });

  it("falls back to a nameless greeting when there's no signed-in user yet", () => {
    apiClientMockState.currentUser = null;
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));
    expect(screen.getByText(/^Hi\. I'm the PhishAware Assistant/)).toBeTruthy();
  });

  it("shows one-tap starter prompts before the first message, and sends one immediately on tap", () => {
    apiClientMockState.sendChatbotMessage = (_payload, handlers) => {
      handlers.onSuccess?.({ reply: "BEC scams impersonate an executive or vendor to redirect a payment." });
    };
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));

    const prompt = screen.getByText("How do BEC scams usually work?");
    fireEvent.click(prompt);

    expect(screen.getByText("How do BEC scams usually work?")).toBeTruthy();
  });

  it("hides the starter prompts once a conversation has started", () => {
    apiClientMockState.sendChatbotMessage = (_payload, handlers) => {
      handlers.onSuccess?.({ reply: "ok" });
    };
    renderWidget();
    fireEvent.click(screen.getByLabelText(/Open PhishAware Assistant/i));

    expect(screen.queryByText("What's the most common phishing red flag?")).toBeTruthy();
    fireEvent.click(screen.getByText("What's the most common phishing red flag?"));
    expect(screen.queryByText("Give me a tip to improve my next practice round")).toBeNull();
  });

  it("shows an always-available indicator dot on the launcher when closed", () => {
    renderWidget();
    const launcher = screen.getByLabelText(/Open PhishAware Assistant/i);
    expect(launcher.querySelector(".animate-pulse")).toBeTruthy();
  });
});
