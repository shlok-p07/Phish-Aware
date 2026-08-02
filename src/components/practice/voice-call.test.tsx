import { describe, expect, it, afterEach, beforeEach } from "bun:test";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { VoiceCall } from "./voice-call";

const SCENARIO = {
  id: "scenario-voice-1",
  sender: "Bank Security",
  subject: "",
  body: "Caller: We detected unusual activity.\nCaller: Confirm your PIN to unlock the account.",
  difficulty: 2,
};

/**
 * A speech-synthesis stand-in that hands back the queued utterances so a test
 * can drive them, which is the only way to assert that captions really do
 * trail the voice rather than appearing all at once.
 */
class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onboundary: ((event: { charIndex: number; name?: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

let queued: FakeUtterance[] = [];
let cancelled = 0;
let paused = 0;
let resumed = 0;

function installSpeechMock() {
  queued = [];
  cancelled = 0;
  paused = 0;
  resumed = 0;
  (globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
  (globalThis as any).speechSynthesis = {
    speak: (u: FakeUtterance) => queued.push(u),
    cancel: () => {
      cancelled += 1;
    },
    pause: () => {
      paused += 1;
    },
    resume: () => {
      resumed += 1;
    },
    getVoices: () => [{ name: "Samantha", lang: "en-US" }],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).window.SpeechSynthesisUtterance = FakeUtterance;
  (globalThis as any).window.speechSynthesis = (globalThis as any).speechSynthesis;
}

function renderCall(overrides: Partial<Parameters<typeof VoiceCall>[0]> = {}) {
  return render(
    <VoiceCall
      scenario={SCENARIO}
      senderName="Bank Security"
      reviewing={false}
      senderHighlighted={false}
      {...overrides}
    />,
  );
}

const answer = () => fireEvent.click(screen.getByRole("button", { name: /Answer call/i }));

beforeEach(() => {
  installSpeechMock();
});

afterEach(() => {
  cleanup();
});

describe("VoiceCall", () => {
  it("starts as an unanswered incoming call", () => {
    renderCall();
    expect(screen.getByText("Ringing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Answer call/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Decline call/i })).toBeTruthy();
  });

  // The whole point of the exercise: a learner handed the script would read it
  // instead of listening for the tells in the delivery.
  it("does not show the transcript before the call is answered", () => {
    renderCall();
    expect(screen.queryByText(/We detected unusual activity/)).toBeNull();
    expect(screen.queryByText(/Confirm your PIN/)).toBeNull();
  });

  it("queues one utterance per line so captions can track the voice", () => {
    renderCall();
    answer();
    expect(queued).toHaveLength(2);
    expect(queued[0]!.text).toBe("We detected unusual activity.");
    expect(queued[1]!.text).toBe("Confirm your PIN to unlock the account.");
  });

  it("reveals each line only once the caller has started saying it", () => {
    renderCall();
    answer();

    // Answered, but nothing spoken yet -- no lines on screen.
    expect(screen.queryByText(/We detected unusual activity/)).toBeNull();

    act(() => queued[0]!.onstart!());
    expect(screen.getByText(/We detected unusual activity/)).toBeTruthy();
    expect(screen.queryByText(/Confirm your PIN/)).toBeNull();

    act(() => queued[1]!.onstart!());
    expect(screen.getByText(/Confirm your PIN/)).toBeTruthy();
  });

  it("ends the call after the last line finishes", () => {
    renderCall();
    answer();
    act(() => queued[0]!.onstart!());
    act(() => queued[1]!.onstart!());
    act(() => queued[1]!.onend!());

    expect(screen.getByText("Call ended")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Replay/i })).toBeTruthy();
  });

  it("still reveals a line whose speech errored, so the caption can't stall", () => {
    renderCall();
    answer();
    act(() => queued[0]!.onerror!());
    expect(screen.getByText(/We detected unusual activity/)).toBeTruthy();
  });

  it("notes how much went unheard when the learner hangs up early", () => {
    renderCall();
    answer();
    act(() => queued[0]!.onstart!());
    fireEvent.click(screen.getByRole("button", { name: /^End call$/i }));

    expect(screen.getByText(/1 more line went unheard/)).toBeTruthy();
  });

  // Anyone who can't use the audio still needs the words.
  it("can reveal the whole transcript on demand", () => {
    renderCall();
    answer();
    fireEvent.click(screen.getByRole("button", { name: /Show full transcript/i }));

    expect(screen.getByText(/We detected unusual activity/)).toBeTruthy();
    expect(screen.getByText(/Confirm your PIN/)).toBeTruthy();
  });

  it("releases the full transcript for review once a verdict is in", () => {
    const { rerender } = renderCall();
    rerender(
      <VoiceCall scenario={SCENARIO} senderName="Bank Security" reviewing senderHighlighted={false} />,
    );

    expect(screen.getByText(/We detected unusual activity/)).toBeTruthy();
    expect(screen.getByText(/Confirm your PIN/)).toBeTruthy();
  });

  it("pauses and resumes the voice when muted", () => {
    renderCall();
    answer();
    fireEvent.click(screen.getByRole("button", { name: /Mute call/i }));
    expect(paused).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /Unmute call/i }));
    expect(resumed).toBe(1);
  });

  it("silences the call when it unmounts", () => {
    const { unmount } = renderCall();
    answer();
    const before = cancelled;
    unmount();
    expect(cancelled).toBeGreaterThan(before);
  });

  it("declining never plays any audio", () => {
    renderCall();
    fireEvent.click(screen.getByRole("button", { name: /Decline call/i }));
    expect(queued).toHaveLength(0);
    expect(screen.getByText("Call ended")).toBeTruthy();
  });
});
