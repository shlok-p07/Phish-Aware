"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNextPracticeScenario,
  useSubmitAttempt,
  useListCueOptions,
  getGetNextPracticeScenarioQueryKey,
  getGetDashboardQueryKey,
  getGetCurrentUserQueryKey
} from "@/api-client";
import {
  ShieldAlert, ShieldCheck, ArrowRight, Target,
  CheckCircle2, XCircle, Info, Sparkles,
  Inbox, Star, Archive, Trash2, CornerUpLeft, MoreVertical, Paperclip, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Define the steps of the practice loop
type PracticeStep = 'inspect' | 'cues' | 'confidence' | 'feedback';

// Parse "Name <email@x.com>" or a bare address into display parts.
function parseSender(raw: string) {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m && m[2]) {
    const email = m[2].trim();
    return { name: (m[1].trim() || email), email };
  }
  if (raw.includes("@")) {
    return { name: raw.trim(), email: raw.trim() };
  }
  return { name: raw.trim(), email: "" };
}

const TIMES = ["8:14 AM", "9:03 AM", "10:47 AM", "11:22 AM", "1:38 PM", "3:05 PM", "4:51 PM"];

// Decoy inbox rows to sell the mailbox metaphor (non-interactive).
const DECOYS = [
  { name: "Google Calendar", subject: "Reminder: Team sync at 2:00 PM", snippet: "You have an event starting soon.", time: "7:45 AM" },
  { name: "GitHub", subject: "[phish-aware] 3 new pull requests", snippet: "Activity across repositories you follow.", time: "Yesterday" },
  { name: "LinkedIn", subject: "You appeared in 7 searches this week", snippet: "See who's been looking at your profile.", time: "Yesterday" },
  { name: "Spotify", subject: "Your Wrapped is almost here", snippet: "A year of listening, wrapped up for you.", time: "Mon" },
];

export default function PracticePage() {
  const queryClient = useQueryClient();

  // Data hooks
  const { data: scenario, isLoading: isScenarioLoading, isError: isScenarioError } = useGetNextPracticeScenario();
  const { data: availableCues, isLoading: isCuesLoading } = useListCueOptions();
  const submitAttempt = useSubmitAttempt();

  // Local state
  const [step, setStep] = useState<PracticeStep>('inspect');
  const [verdict, setVerdict] = useState<boolean | null>(null); // true = phishing
  const [selectedCues, setSelectedCues] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number>(50);
  const [result, setResult] = useState<any>(null);

  if (isScenarioLoading || isCuesLoading) {
    return (
      <div className="max-w-5xl mx-auto h-[60vh] flex flex-col justify-center gap-6 p-4">
        <div className="h-12 w-1/3 bg-muted rounded-lg animate-pulse" />
        <div className="h-110 w-full bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (isScenarioError || !scenario || !availableCues) {
    return (
      <Card className="max-w-xl mx-auto mt-12 border border-destructive/20 bg-destructive/5">
        <CardContent className="pt-6 text-center">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-bold text-lg mb-2">No scenarios available</p>
          <p className="text-muted-foreground font-medium">You might have finished all currently available practice scenarios. Check back later!</p>
        </CardContent>
      </Card>
    );
  }

  const handleVerdict = (isPhishing: boolean) => {
    setVerdict(isPhishing);
    setStep(isPhishing ? 'cues' : 'confidence'); // Skip cues if legit, they're "red flags"
    setSelectedCues([]);
  };

  const toggleCue = (cueId: string) => {
    setSelectedCues(prev =>
      prev.includes(cueId) ? prev.filter(id => id !== cueId) : [...prev, cueId]
    );
  };

  const handleSubmit = () => {
    if (verdict === null) return;

    submitAttempt.mutate({
      data: {
        scenarioId: scenario.id,
        verdict,
        selectedCues: selectedCues as any[],
        confidence
      }
    }, {
      onSuccess: (data) => {
        setResult(data);
        setStep('feedback');
        // Pre-invalidate so dashboard updates behind the scenes
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      }
    });
  };

  const resetAndNext = () => {
    setResult(null);
    setVerdict(null);
    setSelectedCues([]);
    setConfidence(50);
    setStep('inspect');
    queryClient.invalidateQueries({ queryKey: getGetNextPracticeScenarioQueryKey() });
  };

  // Helper to get cue label
  const getCueLabel = (id: string) => availableCues.find(c => c.id === id)?.label || id;

  const { name: senderName, email: senderEmail } = parseSender(scenario.sender);
  const initial = (senderName || "?").charAt(0).toUpperCase();
  const timestamp = TIMES[scenario.id % TIMES.length];
  const snippet = scenario.body.replace(/\s+/g, " ").trim().slice(0, 64);

  // Toolbar shown at the top of the reading pane (decorative mail actions).
  const ReadingPaneToolbar = () => (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/30 shrink-0 text-muted-foreground">
      {[Archive, Trash2, CornerUpLeft].map((Icon, i) => (
        <span key={i} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-hidden>
          <Icon className="w-4 h-4" />
        </span>
      ))}
      <div className="ml-auto flex items-center gap-1">
        <Badge variant="outline" className="font-bold text-[10px] uppercase shadow-none border-muted-foreground/30 text-muted-foreground">
          {scenario.vector}
        </Badge>
        <Badge variant="secondary" className="font-bold text-[10px] uppercase bg-background shadow-sm border">
          Diff: {scenario.difficulty}
        </Badge>
        <span className="p-2 rounded-lg hover:bg-muted transition-colors" aria-hidden>
          <MoreVertical className="w-4 h-4" />
        </span>
      </div>
    </div>
  );

  // The email reading pane — styled like a real mail client. Shown in all states.
  const MailClient = () => {
    const compact = step !== 'inspect';
    return (
    <Card className={`border shadow-sm flex flex-col p-0 overflow-hidden ${compact ? 'h-auto max-h-[70vh]' : 'h-[62vh] max-h-160'} transition-all duration-500`}>
      <ReadingPaneToolbar />

      {/* Subject line */}
      <div className={`px-5 md:px-6 shrink-0 ${compact ? 'pt-3 pb-2' : 'pt-5 pb-3'}`}>
        <div className="flex items-start justify-between gap-3">
          <h3 className={`font-display font-bold leading-tight ${compact ? 'text-lg' : 'text-xl md:text-2xl'}`}>{scenario.subject}</h3>
          <Star className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-1" aria-hidden />
        </div>
      </div>

      {/* Sender identity row */}
      <div className={`px-5 md:px-6 flex items-center gap-3 border-b border-border shrink-0 ${compact ? 'pb-3' : 'pb-4'}`}>
        <div className={`rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 ${compact ? 'w-9 h-9 text-base' : 'w-10 h-10 text-lg'}`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{senderName}</span>
            {senderEmail && (
              <span className="text-xs font-medium text-muted-foreground truncate">&lt;{senderEmail}&gt;</span>
            )}
          </div>
          <p className="text-xs font-medium text-muted-foreground">to me</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground shrink-0">{timestamp}</span>
      </div>

      {/* Body */}
      <CardContent className="flex-1 min-h-0 px-5 md:px-6 py-5 text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap bg-background text-foreground/90">
        {scenario.body}

        {scenario.links.length > 0 && (
          <div className="mt-6 space-y-2 border-t border-dashed border-border pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Links in this message</p>
            {scenario.links.map((link, idx) => (
              <div key={idx} className="bg-muted/30 border border-border p-2 rounded-lg text-primary text-xs break-all relative group cursor-help transition-colors hover:bg-muted/50">
                <span className="underline decoration-dashed decoration-primary/50">{link}</span>
                <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 bg-foreground text-background text-xs p-2 rounded-md z-10 break-all w-full shadow-lg">
                  Destination URL: {link}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Attachment footer */}
      {scenario.attachmentName && (
        <div className="px-5 md:px-6 py-3 border-t border-border bg-muted/20 shrink-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold bg-background border border-border px-3 py-2 rounded-lg text-foreground max-w-full">
            <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate">{scenario.attachmentName}</span>
          </div>
        </div>
      )}
    </Card>
    );
  };

  // A faux inbox list — the current scenario sits at the top as the selected, unread message.
  const InboxList = () => (
    <Card className="border shadow-sm p-0 overflow-hidden flex flex-col h-[62vh] max-h-160">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
        <Inbox className="w-5 h-5 text-primary" />
        <span className="font-display font-bold text-base">Inbox</span>
        <Badge className="ml-auto bg-primary hover:bg-primary text-primary-foreground font-bold text-[10px] px-2 py-0.5">1 new</Badge>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-muted-foreground">
          <Search className="w-4 h-4" />
          <span className="text-xs font-medium">Search mail</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {/* Active (current scenario) row */}
        <div className="px-4 py-3 bg-primary/10 border-l-2 border-primary cursor-default">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-sm text-foreground truncate">{senderName}</span>
            <span className="text-[11px] font-bold text-primary shrink-0">{timestamp}</span>
          </div>
          <p className="font-semibold text-sm text-foreground truncate">{scenario.subject}</p>
          <p className="text-xs font-medium text-muted-foreground truncate">{snippet}…</p>
        </div>
        {/* Decoys */}
        {DECOYS.map((d, i) => (
          <div key={i} className="px-4 py-3 opacity-60 cursor-default select-none">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium text-sm text-foreground truncate">{d.name}</span>
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">{d.time}</span>
            </div>
            <p className="font-medium text-sm text-foreground truncate">{d.subject}</p>
            <p className="text-xs font-medium text-muted-foreground truncate">{d.snippet}</p>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col relative pb-12 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <Target className="w-8 h-8 text-primary" />
          Practice
        </h1>
      </div>

      {step === 'inspect' ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
            <div className="hidden lg:block">
              <InboxList />
            </div>
            <MailClient />
          </div>

          {/* Verdict controls */}
          <div className="max-w-2xl mx-auto w-full mt-6 flex flex-col gap-4">
            <p className="text-center font-display font-bold text-xl mb-2 text-foreground">
              Is this Phishing or Legitimate?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Button
                size="lg"
                variant="outline"
                className="py-10 border border-destructive/20 bg-destructive/5 hover:bg-destructive hover:text-destructive-foreground text-destructive font-bold text-xl rounded-lg transition-all shadow-sm"
                onClick={() => handleVerdict(true)}
              >
                <ShieldAlert className="mr-3 w-7 h-7" />
                Phishing
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="py-10 border border-success/20 bg-success/5 hover:bg-success hover:text-success-foreground text-success font-bold text-xl rounded-lg transition-all shadow-sm"
                onClick={() => handleVerdict(false)}
              >
                <ShieldCheck className="mr-3 w-7 h-7" />
                Legitimate
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_400px] items-start">
          <MailClient />

          {/* Side Panel for controls depending on step */}
          {step !== 'feedback' && (
            <Card className="border shadow-sm animate-in slide-in-from-right-8 duration-300 sticky top-24">
              <CardHeader className="bg-muted/30 border-b pb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                  <span className={step === 'cues' ? 'text-primary' : ''}>1. Verdict</span>
                  <span className="opacity-50">→</span>
                  {verdict && <><span className={step === 'cues' ? 'text-primary' : ''}>2. Cues</span><span className="opacity-50">→</span></>}
                  <span className={step === 'confidence' ? 'text-primary' : ''}>{verdict ? '3' : '2'}. Confidence</span>
                </div>
                <h2 className="text-xl font-display font-bold">
                  {step === 'cues' ? "What gave it away?" : "How confident are you?"}
                </h2>
              </CardHeader>

              <CardContent className="pt-6 pb-2">
                {step === 'cues' && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-muted-foreground">
                      Select all the red flags you noticed in this message.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableCues.map(cue => {
                        const isSelected = selectedCues.includes(cue.id);
                        return (
                          <button
                            key={cue.id}
                            onClick={() => toggleCue(cue.id)}
                            className={`text-sm font-semibold px-3 py-2 rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-primary/10 border-primary text-primary shadow-sm scale-[1.02]'
                                : 'bg-background border-border text-foreground hover:border-primary/50'
                            }`}
                          >
                            {cue.label}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      className="w-full mt-4 py-6 rounded-lg font-bold"
                      onClick={() => setStep('confidence')}
                    >
                      Next <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}

                {step === 'confidence' && (
                  <div className="space-y-8">
                    <div className="flex flex-col items-center justify-center p-6 bg-muted/30 rounded-lg border border-transparent">
                      <span className="text-5xl font-display font-bold text-primary mb-2">{confidence}%</span>
                      <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Confidence</span>
                    </div>

                    <Slider
                      value={[confidence]}
                      onValueChange={(v) => setConfidence(v[0])}
                      max={100}
                      step={5}
                      className="py-4"
                    />

                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>Just guessing (0%)</span>
                      <span>Absolutely sure (100%)</span>
                    </div>

                    <Button
                      className="w-full py-6 rounded-lg font-bold text-lg shadow-sm"
                      onClick={handleSubmit}
                      disabled={submitAttempt.isPending}
                    >
                      {submitAttempt.isPending ? "Submitting..." : "Submit Verdict"}
                    </Button>

                    <Button variant="ghost" className="w-full font-bold" onClick={() => setStep(verdict ? 'cues' : 'inspect')}>
                      Back
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Feedback Dialog */}
      <Dialog open={step === 'feedback'} onOpenChange={() => {}}>
        <DialogContent className="max-w-md p-0 border overflow-hidden rounded-lg gap-0 flex flex-col max-h-[90vh] [&>button]:hidden">
          {result && (
            <>
              {/* Header colored by correctness */}
              <div className={`pt-10 pb-6 px-6 text-center relative shrink-0 ${result.correct ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                {result.leveledUp && <Sparkles className="absolute top-4 right-4 w-6 h-6 opacity-40" />}
                <div className="bg-background text-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-background/20">
                  {result.correct ? <CheckCircle2 className={`w-8 h-8 text-success`} /> : <XCircle className={`w-8 h-8 text-destructive`} />}
                </div>
                <DialogTitle className="text-3xl font-display font-bold mb-1 text-inherit">
                  {result.correct ? "Correct" : "Incorrect"}
                </DialogTitle>
                <p className="font-medium opacity-90 text-lg">
                  {result.correctVerdict ? "You correctly identified the message." : "You missed the true intent of this message."}
                </p>
              </div>

              <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto bg-background">
                {/* AI Explanation */}
                <div className="bg-muted/30 p-4 rounded-lg border border-border text-sm font-medium leading-relaxed">
                  {result.explanation}
                </div>

                {/* Cue Feedback (Only if it was a phishing scenario and they had to pick cues) */}
                {verdict && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Your Analysis</h4>

                    {result.caughtCues.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-success mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Caught</p>
                        <div className="flex flex-wrap gap-1">
                          {result.caughtCues.map((id: string) => <Badge key={id} variant="outline" className="bg-success/10 text-success border-success/30 font-bold">{getCueLabel(id)}</Badge>)}
                        </div>
                      </div>
                    )}

                    {result.missedCues.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1"><XCircle className="w-3 h-3"/> Missed</p>
                        <div className="flex flex-wrap gap-1">
                          {result.missedCues.map((id: string) => <Badge key={id} variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 font-bold">{getCueLabel(id)}</Badge>)}
                        </div>
                      </div>
                    )}

                    {result.falseCues.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-orange-500 mb-1 flex items-center gap-1"><Info className="w-3 h-3"/> Incorrectly Flagged</p>
                        <div className="flex flex-wrap gap-1">
                          {result.falseCues.map((id: string) => <Badge key={id} variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 font-bold">{getCueLabel(id)}</Badge>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Calibration */}
                <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 flex items-start gap-3 text-sm font-medium text-foreground">
                  <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p>{result.calibrationNote}</p>
                </div>

                {/* Rewards */}
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="space-y-0.5">
                     <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Points earned</p>
                     <p className="text-2xl font-display font-bold text-primary">+{result.xpAwarded}</p>
                  </div>
                  {result.leveledUp && (
                     <Badge className="bg-primary hover:bg-primary font-semibold px-3 py-1 text-sm shadow-sm">Level {result.level}</Badge>
                  )}
                </div>
              </div>

              <DialogFooter className="p-4 bg-muted/20 border-t shrink-0">
                <Button className="w-full py-6 text-lg font-bold rounded-lg shadow-sm group" onClick={resetAndNext}>
                  Next Scenario
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
