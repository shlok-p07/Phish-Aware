"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PhoneIncoming, PhoneOff, Mic, MicOff, RotateCcw, FileText, PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { highlightClass } from "@/components/practice/cue-highlight";
import { pickCallerVoiceProfile, resolveSpeechVoice, type ScenarioVoiceInput } from "./caller-voice";
import { formatDuration, parseTranscript, splitWords, wordIndexAt } from "./transcript";

type CallPhase = "incoming" | "connected" | "ended";

interface VoiceCallProps {
  scenario: ScenarioVoiceInput;
  senderName: string;
  /** True once the learner has committed a verdict -- the pane shrinks and the
   *  full transcript is released for review. */
  reviewing: boolean;
  senderHighlighted: boolean;
}

/**
 * Simulated phone call screen.
 *
 * The fixed slate/emerald/red palette below is deliberate and should NOT be
 * swapped for theme tokens: this is a depiction of a phone's call UI, and a real
 * one looks the same regardless of what theme the surrounding app is in. Green
 * answer / red decline are part of what makes it read as a phone at a glance.
 * (Contrast within this surface is self-contained, since it sets both its own
 * background and its own foreground.)
 */
export function VoiceCall({ scenario, senderName, reviewing, senderHighlighted }: VoiceCallProps) {
  const lines = useMemo(() => parseTranscript(scenario.body), [scenario.body]);
  const profile = useMemo(() => pickCallerVoiceProfile(scenario), [scenario]);

  const hasSpeech = useMemo(
    () =>
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window,
    [],
  );

  const [phase, setPhase] = useState<CallPhase>("incoming");
  // How many lines the caller has actually said out loud. This is the whole
  // mechanic: captions trail the voice instead of preceding it, so the learner
  // has to listen rather than skim ahead.
  const [spokenCount, setSpokenCount] = useState(0);
  const [activeWord, setActiveWord] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const startedRef = useRef(false);

  useEffect(() => {
    if (!hasSpeech) return;
    const sync = () => setVoices(window.speechSynthesis.getVoices());
    sync();
    window.speechSynthesis.addEventListener("voiceschanged", sync);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", sync);
  }, [hasSpeech]);

  // Never leave a call talking into an empty room -- unmounting (a new
  // scenario, a vector switch, leaving the page) has to silence it.
  useEffect(() => {
    if (!hasSpeech) return;
    return () => window.speechSynthesis.cancel();
  }, [hasSpeech]);

  useEffect(() => {
    if (phase !== "connected" || muted) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase, muted]);

  // Once a verdict is in the exercise is over, so the caller is stopped
  // mid-sentence rather than talking over the feedback the learner is now
  // reading. Showing the transcript at that point used to be set from here too;
  // it's derived at render now, leaving this effect with only the side effect
  // it genuinely needs to perform.
  useEffect(() => {
    if (reviewing && hasSpeech) window.speechSynthesis.cancel();
  }, [reviewing, hasSpeech]);

  const endCall = useCallback(() => {
    if (hasSpeech) window.speechSynthesis.cancel();
    setPhase("ended");
    setActiveWord(-1);
  }, [hasSpeech]);

  /**
   * Queues one utterance per line rather than one for the whole call. That's
   * what makes the caption sync possible: `onstart` fires per line, so we know
   * exactly which line is being spoken right now. A single utterance would only
   * tell us it had begun and ended.
   */
  const speak = useCallback(
    (fromLine: number) => {
      if (!hasSpeech || lines.length === 0) return;
      const synth = window.speechSynthesis;
      synth.cancel();

      const voice = resolveSpeechVoice(voices, profile);
      lines.forEach((line, index) => {
        if (index < fromLine) return;
        const utterance = new window.SpeechSynthesisUtterance(line.text);
        utterance.rate = profile.rate;
        utterance.pitch = profile.pitch;
        if (voice) utterance.voice = voice;

        const words = splitWords(line.text);
        utterance.onstart = () => {
          setSpokenCount(index + 1);
          setActiveWord(-1);
        };
        utterance.onboundary = (event: SpeechSynthesisEvent) => {
          setActiveWord(wordIndexAt(words, event.charIndex));
        };
        utterance.onend = () => {
          setActiveWord(-1);
          if (index === lines.length - 1) endCall();
        };
        // A failed line shouldn't strand the caption on a call that has gone
        // silent -- reveal it and keep the queue moving.
        utterance.onerror = () => {
          setSpokenCount((n) => Math.max(n, index + 1));
          if (index === lines.length - 1) endCall();
        };
        synth.speak(utterance);
      });
    },
    [hasSpeech, lines, profile, voices, endCall],
  );

  const answer = () => {
    // speak() silently no-ops when there's nothing to say (a scenario whose
    // body didn't parse into any "Caller:" lines) -- without this, the call
    // would connect and just sit there indefinitely with nothing ever
    // advancing spokenCount, and no automatic way to end it.
    if (lines.length === 0) {
      endCall();
      return;
    }
    setPhase("connected");
    setElapsed(0);
    setSpokenCount(0);
    startedRef.current = true;
    // Answering is the user gesture browsers require before audio may play,
    // which is the other reason this call rings before it connects.
    speak(0);
  };

  const replay = () => {
    if (lines.length === 0) {
      endCall();
      return;
    }
    setPhase("connected");
    setElapsed(0);
    setSpokenCount(0);
    setActiveWord(-1);
    speak(0);
  };

  const toggleMute = () => {
    if (!hasSpeech) return;
    setMuted((wasMuted) => {
      if (wasMuted) window.speechSynthesis.resume();
      else window.speechSynthesis.pause();
      return !wasMuted;
    });
  };

  /*
   * The transcript is earned line by line as the caller speaks -- there is no
   * manual reveal, so the only way to see a line is to have heard it. Two cases
   * hand over the whole thing anyway:
   *   reviewing  -- the exercise is over and the feedback refers to these words
   *   !hasSpeech -- there's nothing to listen to, so gating it leaves a blank
   *                 pane with no way for spokenCount to ever advance
   */
  const showTranscript = reviewing || !hasSpeech;

  const visibleLines = showTranscript ? lines.length : spokenCount;
  const listening = phase === "connected" && !muted;
  // Which line is being read aloud right now -- a separate question from how
  // many lines are visible, so the live word-by-word highlight keeps working
  // even when the whole transcript is on screen.
  const currentSpeakingLine = listening ? spokenCount - 1 : -1;

  return (
    <Card
      className={`border shadow-sm flex flex-col p-0 overflow-hidden bg-slate-950 text-slate-100 ${
        reviewing ? "h-auto max-h-[70vh]" : "h-[62vh] max-h-160"
      } transition-all duration-500`}
    >
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/80 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
          <span>Simulated call</span>
          <span className="flex items-center gap-1.5">
            {phase === "connected" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            )}
            {phase === "incoming" ? "Ringing" : phase === "connected" ? formatDuration(elapsed) : "Call ended"}
          </span>
        </div>
      </div>

      {/* Caller identity */}
      <div className={`px-5 md:px-6 shrink-0 flex flex-col items-center text-center ${reviewing ? "py-4" : "py-6"}`}>
        <div className="relative">
          {phase === "incoming" && (
            <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" aria-hidden />
          )}
          <div
            className={`relative rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center ${
              reviewing ? "w-12 h-12" : "w-20 h-20"
            } ${listening ? "ring-2 ring-emerald-400/60" : ""}`}
          >
            <PhoneIncoming className={reviewing ? "w-5 h-5" : "w-8 h-8"} />
          </div>
        </div>
        <p className={`font-semibold mt-3 ${reviewing ? "text-sm" : "text-lg"} ${highlightClass(senderHighlighted)}`}>
          {senderName}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {phase === "incoming"
            ? "Incoming call…"
            : phase === "connected"
              ? muted ? "Muted" : "Connected"
              : `Ended · ${formatDuration(elapsed)}`}
        </p>
      </div>

      {/* Live captions */}
      <CardContent className="flex-1 min-h-0 px-5 md:px-6 py-4 overflow-y-auto space-y-2">
        {/* Someone can submit a verdict without ever answering. Once the round
            is over they still need the transcript to review against the
            feedback, so `reviewing` overrides the un-answered state. */}
        {phase === "incoming" && !reviewing ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Answer to hear the call. What the caller says is transcribed here as they speak it.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
              <FileText className="w-3 h-3" />
              Live transcript
            </div>
            <div aria-live="polite" className="space-y-2">
              {lines.slice(0, visibleLines).map((line, index) => {
                const isCurrent = index === currentSpeakingLine;
                const words = splitWords(line.text);
                return (
                  <p
                    key={`${index}-${line.text}`}
                    className={`whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-relaxed transition-colors ${
                      isCurrent
                        ? "bg-slate-800/80 border-slate-600"
                        : "bg-slate-900/70 border-slate-800"
                    }`}
                  >
                    <span className="text-emerald-300 font-semibold mr-1">Caller:</span>
                    {isCurrent && activeWord >= 0
                      ? words.map((word, wordIndex) => (
                          <span
                            key={`${wordIndex}-${word.text}`}
                            className={wordIndex === activeWord ? "text-white font-semibold" : ""}
                          >
                            {word.text}{" "}
                          </span>
                        ))
                      : line.text}
                    {/* Caret on the line the caller is saying right now. */}
                    {isCurrent && listening && (
                      <span
                        aria-hidden
                        className="inline-block align-middle ml-0.5 w-0.5 h-[1.05em] bg-emerald-300 animate-pulse"
                      />
                    )}
                  </p>
                );
              })}
            </div>
            {visibleLines === 0 && (
              <p className="text-sm text-slate-400 italic py-4">Listening…</p>
            )}
            {phase === "ended" && !showTranscript && visibleLines < lines.length && (
              <p className="text-xs text-slate-400 pt-2">
                You hung up early. {lines.length - visibleLines} more line
                {lines.length - visibleLines === 1 ? "" : "s"} went unheard.
              </p>
            )}
          </>
        )}
      </CardContent>

      {/* Controls */}
      <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/70 shrink-0 space-y-2">
        {phase === "incoming" ? (
          <div className="flex items-center justify-center gap-6">
            <Button
              type="button"
              onClick={endCall}
              className="rounded-full w-14 h-14 bg-red-500 hover:bg-red-600 text-white"
              aria-label="Decline call"
            >
              <PhoneOff className="w-5 h-5" />
            </Button>
            <Button
              type="button"
              onClick={answer}
              className="rounded-full w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white"
              aria-label="Answer call"
            >
              <PhoneCall className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase !== "connected" || !hasSpeech}
              className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-40"
              aria-label={muted ? "Unmute call" : "Mute call"}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {phase === "connected" ? (
              <Button
                type="button"
                onClick={endCall}
                className="rounded-full w-12 h-12 bg-red-500 hover:bg-red-600 text-white"
                aria-label="End call"
              >
                <PhoneOff className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={replay}
                disabled={!hasSpeech}
                className="rounded-full px-4 h-12 bg-slate-800 hover:bg-slate-700 text-slate-100"
              >
                <RotateCcw className="w-4 h-4" />
                Replay
              </Button>
            )}
          </div>
        )}

        {!hasSpeech && (
          <div className="flex justify-center">
            <Badge variant="outline" className="text-[10px] uppercase text-slate-300 border-slate-700">
              Audio unavailable: transcript shown
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
