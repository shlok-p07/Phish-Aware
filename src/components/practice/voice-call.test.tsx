import { describe, expect, it, afterEach, beforeEach } from "bun:test";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
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

interface FakeSpeechSynthesis {
  speak: (u: FakeUtterance) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  getVoices: () => { name: string; lang: string }[];
  addEventListener: () => void;
  removeEventListener: () => void;
}

/** happy-dom's `window`/`globalThis` don't ship the Web Speech API at all, so this test provides its own. */
interface GlobalWithSpeech {
  SpeechSynthesisUtterance?: typeof FakeUtterance;
  speechSynthesis?: FakeSpeechSynthesis;
  window: {
    SpeechSynthesisUtterance?: typeof FakeUtterance;
    speechSynthesis?: FakeSpeechSynthesis;
  };
}
const fakeGlobal = globalThis as unknown as GlobalWithSpeech;

function installSpeechMock() {
  queued = [];
  cancelled = 0;
  paused = 0;
  resumed = 0;
  fakeGlobal.SpeechSynthesisUtterance = FakeUtterance;
  fakeGlobal.speechSynthesis = {
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
  fakeGlobal.window.SpeechSynthesisUtterance = FakeUtterance;
  fakeGlobal.window.speechSynthesis = fakeGlobal.speechSynthesis;
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

  // Regression: "Show full transcript" used to be wired to the same
  // condition as the live word-by-word highlight, so revealing the rest of
  // the transcript silently killed the sync on the line still being spoken.
  it("keeps live-highlighting the line being spoken after revealing the full transcript", () => {
    renderCall();
    answer();
    act(() => queued[0]!.onstart!());
    act(() => queued[0]!.onboundary!({ charIndex: 0 }));

    fireEvent.click(screen.getByRole("button", { name: /Show full transcript/i }));

    // The sentence is now split into one span per word (that's how the
    // karaoke-style highlight works), so it can no longer be matched as one
    // block of text -- find the line by its "Caller:" label instead.
    const spokenLine = screen.getAllByText("Caller:")[0]!.closest("p")!;
    expect(spokenLine.className).toContain("bg-slate-800/80");
    expect(within(spokenLine).getByText("We").className).toContain("text-white");
  });

  it("hides the transcript again after toggling show then hide", () => {
    renderCall();
    answer();
    act(() => queued[0]!.onstart!());

    fireEvent.click(screen.getByRole("button", { name: /Show full transcript/i }));
    expect(screen.getByText(/Confirm your PIN/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Hide full transcript/i }));
    expect(screen.queryByText(/Confirm your PIN/)).toBeNull();
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

  // Regression: a generated scenario whose body doesn't parse into any
  // "Caller:" lines used to leave the call connected forever -- speak() had
  // nothing to queue, so spokenCount never advanced and nothing ever ended
  // the call automatically.
  it("ends the call immediately instead of hanging when the transcript has no lines", () => {
    renderCall({ scenario: { ...SCENARIO, body: "" } });
    answer();
    expect(screen.getByText("Call ended")).toBeTruthy();
    expect(queued).toHaveLength(0);
  });

  it("also ends immediately on replay of an empty transcript", () => {
    renderCall({ scenario: { ...SCENARIO, body: "   \n  " } });
    answer();
    expect(screen.getByText("Call ended")).toBeTruthy();
  });

  it("declining never plays any audio", () => {
    renderCall();
    fireEvent.click(screen.getByRole("button", { name: /Decline call/i }));
    expect(queued).toHaveLength(0);
    expect(screen.getByText("Call ended")).toBeTruthy();
  });

  // Regression: with no speech engine, spokenCount can never advance on its
  // own (nothing ever calls onstart), so a "Hide full transcript" button used
  // to be able to blank the pane with no way to ever recover the text. The
  // fix is not offering the toggle at all in this mode, since the transcript
  // is the only thing there is to show.
  it("never offers a hide-transcript toggle with no speech engine, so the pane can't get stuck blank", () => {
    delete fakeGlobal.window.speechSynthesis;
    delete fakeGlobal.window.SpeechSynthesisUtterance;

    renderCall();
    answer();

    expect(screen.getByText(/We detected unusual activity/)).toBeTruthy();
    expect(screen.getByText(/Confirm your PIN/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Hide full transcript/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Show full transcript/i })).toBeNull();
    expect(screen.getByText("Audio unavailable — transcript shown")).toBeTruthy();
  });
});
