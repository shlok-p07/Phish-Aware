"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNextPracticeScenario,
  useSubmitAttempt,
  useListCueOptions,
  getGetNextPracticeScenarioQueryKey,
  getGetDashboardQueryKey,
  getGetCurrentUserQueryKey,
  type GetNextPracticeScenarioVector,
  type AttemptResult
} from "@/api-client";
import {
  ShieldAlert, ShieldCheck, ArrowRight, Target,
  CheckCircle2, XCircle, Info, Sparkles,
  Inbox, Star, Archive, Trash2, CornerUpLeft, MoreVertical, Paperclip, Search,
  MessageSquare, Phone, Link as LinkIcon, Mail, Shuffle, PhoneCall, PhoneIncoming
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useChatbot, ChatMessageList, ChatComposer } from "@/components/chatbot-widget";
import type { CueId } from "@/server/cues";
import { CUE_REGION, findBodyMatch, highlightClass } from "@/components/practice/cue-highlight";
import { VoiceCall } from "@/components/practice/voice-call";
import Link from "next/link";
import { PageHeader, PageShell } from "@/components/page-shell";
import { EmptyState, PageHeaderSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

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

// Decoy conversation rows to sell the messaging-app metaphor for sms scenarios.
const MESSAGE_DECOYS = [
  { name: "Mom", snippet: "Don't forget to call grandma this weekend!", time: "9:12 AM" },
  { name: "Uber", snippet: "Your driver is 3 minutes away.", time: "Yesterday" },
  { name: "Chase Bank", snippet: "Your statement is ready to view.", time: "Mon" },
];

const CALL_LOG_DECOYS = [
  { name: "City Utilities", snippet: "Scheduled payment reminder.", time: "Yesterday" },
  { name: "Pharmacy Refill", snippet: "Your refill is ready for pickup.", time: "Mon" },
  { name: "School Office", snippet: "Attendance follow-up call.", time: "Mon" },
];

// A sender that reads as a phone number/short code gets a phone glyph instead
// of an initial -- an initial from "+1 (302)..." would just show "+".
const isNumericSender = (name: string) => /^[+\d]/.test(name.trim());

// What to practice: a specific vector, or "mixed" to keep randomizing every
// round (the original behavior). A lesson's "Put it to practice" link can
// preselect one via ?vector=sms.
const VECTOR_FILTER_OPTIONS: { value: GetNextPracticeScenarioVector; label: string; icon: typeof Mail }[] = [
  { value: "mixed", label: "Mixed", icon: Shuffle },
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "voice", label: "Voice", icon: PhoneCall },
];

export default function PracticePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Which vector to serve -- read once from the URL (so a lesson's "Put it
  // to practice" link can land directly in that mode), then owned by the
  // toggle below for the rest of the session.
  const [vectorFilter, setVectorFilter] = useState<GetNextPracticeScenarioVector>(() => {
    const fromUrl = searchParams.get("vector");
    return fromUrl === "email" || fromUrl === "sms" || fromUrl === "voice" ? fromUrl : "mixed";
  });

  // Data hooks
  const { data: scenario, isLoading: isScenarioLoading, isError: isScenarioError } = useGetNextPracticeScenario({ vector: vectorFilter });
  const { data: availableCues, isLoading: isCuesLoading } = useListCueOptions();
  const submitAttempt = useSubmitAttempt();
  const chat = useChatbot();

  // Local state
  const [step, setStep] = useState<PracticeStep>('inspect');
  const [verdict, setVerdict] = useState<boolean | null>(null); // true = phishing
  // CueId, not string: the API takes CueId[], and typing this loosely was what
  // forced the `as any[]` cast at the submit call below.
  const [selectedCues, setSelectedCues] = useState<CueId[]>([]);
  const [confidence, setConfidence] = useState<number>(50);
  const [result, setResult] = useState<AttemptResult | null>(null);
  // The red flag currently being hovered on the results screen -- drives the
  // highlight in the email (mirrors the landing page's InboxPreview mechanic).
  const [activeCue, setActiveCue] = useState<string | null>(null);
  // Index into the shared chat conversation where the scenario-specific
  // explanation reply will land, so we can surface just that answer inline as
  // its own card instead of opening the floating popup. Null until requested.
  const [explainIndex, setExplainIndex] = useState<number | null>(null);

  // Hoisted above the loading/error early-returns below so these hooks run on
  // every render regardless of which branch is taken -- conditionally calling
  // them only once `scenario` was loaded violated the Rules of Hooks (hook
  // order changed between the loading render and the loaded render).
  const isSms = scenario?.vector === "sms";
  const isVoice = scenario?.vector === "voice";

  if (isScenarioLoading || isCuesLoading) {
    return (
      <PageShell>
        <PageHeaderSkeleton actions />
        <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
          <Skeleton className="hidden lg:block h-110" />
          <Skeleton className="h-110" />
        </div>
      </PageShell>
    );
  }

  if (isScenarioError || !scenario || !availableCues) {
    return (
      <PageShell width="xl">
        <EmptyState
          icon={ShieldAlert}
          title="No scenarios available"
          description="You may have worked through everything on offer right now. New scenarios are generated as you go — check back shortly."
          action={
            <Button asChild variant="outline" className="font-semibold">
              <Link href="/learn">Browse lessons meanwhile</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const handleVerdict = (isPhishing: boolean) => {
    setVerdict(isPhishing);
    setStep(isPhishing ? 'cues' : 'confidence'); // Skip cues if legit, they're "red flags"
    setSelectedCues([]);
  };

  // Lets someone change their mind about the verdict itself, not just the
  // cues/confidence after it -- nothing is scored until "Submit Verdict", so
  // there's no reason to lock them out of reconsidering before that point.
  const handleBackToInspect = () => {
    setVerdict(null);
    setSelectedCues([]);
    setStep('inspect');
  };

  const toggleCue = (cueId: CueId) => {
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
        selectedCues,
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

  // The call pane silences itself on unmount, and it remounts per scenario id,
  // so nothing here needs to stop audio explicitly.
  const resetAndNext = () => {
    setResult(null);
    setVerdict(null);
    setSelectedCues([]);
    setConfidence(50);
    setActiveCue(null);
    setExplainIndex(null);
    setStep('inspect');
    queryClient.invalidateQueries({ queryKey: getGetNextPracticeScenarioQueryKey() });
  };

  // Switching what to practice restarts the current round rather than
  // leaving a half-answered verdict pointed at a scenario that's about to
  // change out from under it.
  const handleVectorFilterChange = (next: GetNextPracticeScenarioVector) => {
    setVectorFilter(next);
    setResult(null);
    setVerdict(null);
    setSelectedCues([]);
    setConfidence(50);
    setActiveCue(null);
    setExplainIndex(null);
    setStep('inspect');
  };

  // Helper to get cue label
  const getCueLabel = (id: string) => availableCues.find(c => c.id === id)?.label || id;

  // Seeds the assistant with this exact scenario's outcome so its answer is
  // specific rather than a generic "what is phishing" reply. Unlike the old
  // flow, this does NOT open the floating popup -- it sends the turn into the
  // shared conversation and remembers where the reply will land so we can show
  // that one answer inline as its own card on the results screen.
  const askAboutScenario = () => {
    if (!result) return;
    const missed = result.missedCues.map(getCueLabel).join(", ") || "none";
    const caught = result.caughtCues.map(getCueLabel).join(", ") || "none";
    const mediumDescription = isVoice
      ? `a phone call transcript from "${scenario.sender}"`
      : isSms
        ? `a text message from "${scenario.sender}"`
        : `an email with the subject "${scenario.subject}"`;
    const idx = chat.sendSeeded(
      `I just practiced on ${mediumDescription}. I judged it ${verdict ? "phishing" : "legitimate"}, and I was ${result.correct ? "correct" : "incorrect"}. Cues I caught: ${caught}. Cues I missed: ${missed}. Can you explain why those missed cues mattered here and how to spot that pattern next time?`,
    );
    if (idx !== null) setExplainIndex(idx);
  };

  const { name: senderName, email: senderEmail } = parseSender(scenario.sender);
  const initial = (senderName || "?").charAt(0).toUpperCase();
  const timestamp = TIMES[parseInt(scenario.id.slice(-6), 16) % TIMES.length];
  const snippet = scenario.body.replace(/\s+/g, " ").trim().slice(0, 64);
  // Text-message senders are phone numbers/short codes -- an initial from
  // "+1 (302)..." would just show "+", so those get a phone glyph instead.
  const avatarGlyph = isSms && isNumericSender(senderName) ? <Phone className="w-4 h-4" /> : initial;

  // Toolbar shown at the top of the reading pane (decorative mail/message actions).
  const readingPaneToolbar = () => (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/60 shrink-0 text-muted-foreground">
      {((isVoice ? [PhoneCall, Trash2, CornerUpLeft] : isSms ? [Phone, Trash2, CornerUpLeft] : [Archive, Trash2, CornerUpLeft])).map((Icon, i) => (
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

  // Is a given region currently the target of the hovered red flag? Structured
  // cues (sender/links/attachments) light up their whole region; body cues are
  // handled separately by renderBody below.
  const regionActive = (region: 'sender' | 'links' | 'attachments') =>
    activeCue !== null && CUE_REGION[activeCue as CueId] === region;

  // Renders the body, wrapping the phrase the hovered body-cue points at (if we
  // can find one) in a highlight. Falls back to the plain string when the active
  // cue isn't a body cue or no keyword matches -- the chip still self-highlights.
  const renderBody = () => {
    const cueId = activeCue as CueId | null;
    if (cueId && CUE_REGION[cueId] === 'body') {
      const match = findBodyMatch(scenario.body, cueId);
      if (match) {
        return (
          <>
            {scenario.body.slice(0, match.start)}
            <span className={highlightClass(true)}>
              {scenario.body.slice(match.start, match.end)}
            </span>
            {scenario.body.slice(match.end)}
          </>
        );
      }
    }
    return scenario.body;
  };

  // The email reading pane — styled like a real mail client. Shown in all states.
  // Rendered as a function call ({mailClient()}), not <MailClient/>, so React
  // reconciles it in place instead of remounting the whole subtree every time
  // activeCue changes on hover (which caused the scroll jump / shake).
  const mailClient = () => {
    const compact = step !== 'inspect';
    return (
    <Card className={`border shadow-sm flex flex-col p-0 overflow-hidden ${compact ? 'h-auto max-h-[70vh]' : 'h-[62vh] max-h-160'} transition-all duration-500`}>
      {readingPaneToolbar()}

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
              <span className={`text-xs font-medium text-muted-foreground truncate ${highlightClass(regionActive('sender'))}`}>&lt;{senderEmail}&gt;</span>
            )}
          </div>
          <p className="text-xs font-medium text-muted-foreground">to me</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground shrink-0">{timestamp}</span>
      </div>

      {/* Body */}
      <CardContent className="flex-1 min-h-0 px-5 md:px-6 py-5 text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap bg-background text-foreground/90">
        {renderBody()}

        {scenario.links.length > 0 && (
          <div className={`mt-6 space-y-2 border-t border-dashed border-border pt-4 px-2 -mx-2 rounded transition-colors duration-150 ${regionActive('links') ? 'ring-1 ring-destructive/50 bg-destructive/5' : ''}`}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Links in this message</p>
            {scenario.links.map((link, idx) => (
              <div key={idx} className="bg-muted/60 border border-border p-2 rounded-lg text-primary text-xs break-all relative group cursor-help transition-colors hover:bg-muted">
                <span className="underline decoration-dashed decoration-primary/50">{link.text}</span>
                <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 bg-foreground text-background text-xs p-2 rounded-md z-10 break-all w-full shadow-lg">
                  Destination URL: {link.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Attachment footer */}
      {scenario.attachments.length > 0 && (
        <div className="px-5 md:px-6 py-3 border-t border-border bg-muted/50 shrink-0 space-y-2">
          {scenario.attachments.map((attachment, idx) => (
            <div key={idx} className={`inline-flex items-center gap-2 text-sm font-semibold bg-background border px-3 py-2 rounded-lg text-foreground max-w-full transition-colors duration-150 ${regionActive('attachments') ? 'ring-1 ring-destructive/50 border-destructive/40 bg-destructive/5' : 'border-border'}`}>
              <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{attachment.name}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
    );
  };

  // The sms reading pane — styled like a phone messaging thread, mirroring
  // mailClient()'s layout/hover-highlight mechanics but as a single incoming
  // bubble instead of a subject/sender/attachments layout. Also called as a
  // function ({smsThread()}) for the same stable-reconcile reason.
  const smsThread = () => {
    const compact = step !== 'inspect';
    return (
    <Card className={`border shadow-sm flex flex-col p-0 overflow-hidden ${compact ? 'h-auto max-h-[70vh]' : 'h-[62vh] max-h-160'} transition-all duration-500`}>
      {readingPaneToolbar()}

      {/* Contact header */}
      <div className={`px-5 md:px-6 flex flex-col items-center gap-2 border-b border-border shrink-0 ${compact ? 'py-3' : 'py-5'}`}>
        <div className={`rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 ${compact ? 'w-10 h-10 text-base' : 'w-14 h-14 text-xl'}`}>
          {avatarGlyph}
        </div>
        <span className={`font-semibold text-sm text-foreground ${highlightClass(regionActive('sender'))}`}>{senderName}</span>
      </div>

      {/* Thread body */}
      <CardContent className="flex-1 min-h-0 px-5 md:px-6 py-6 overflow-y-auto bg-muted/40 flex flex-col items-start gap-2">
        <span className="self-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Today · {timestamp}</span>

        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground shadow-sm">
          {renderBody()}
        </div>

        {scenario.links.length > 0 && (
          <div className={`max-w-[85%] space-y-1.5 rounded-xl border p-2.5 text-xs break-all transition-colors duration-150 ${regionActive('links') ? 'ring-1 ring-destructive/50 bg-destructive/5 border-destructive/30' : 'bg-background border-border'}`}>
            {scenario.links.map((link, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-primary">
                <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="underline decoration-dashed decoration-primary/50">{link.text}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    );
  };

  // Keyed by scenario id so a new round mounts a fresh call -- that resets the
  // phase back to "ringing" and cancels any speech still in flight.
  const voiceCallPane = () => (
    <VoiceCall
      key={scenario.id}
      scenario={scenario}
      senderName={senderName}
      reviewing={step !== "inspect"}
      senderHighlighted={regionActive("sender")}
    />
  );

  // A faux inbox list — the current scenario sits at the top as the selected, unread message.
  const inboxList = () => (
    <Card className="border shadow-sm p-0 overflow-hidden flex flex-col h-[62vh] max-h-160">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/60 shrink-0">
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

  // The sms sidebar counterpart to inboxList() — a faux conversation list,
  // current scenario pinned at the top as the active thread.
  const messagesList = () => (
    <Card className="border shadow-sm p-0 overflow-hidden flex flex-col h-[62vh] max-h-160">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/60 shrink-0">
        <MessageSquare className="w-5 h-5 text-primary" />
        <span className="font-display font-bold text-base">Messages</span>
        <Badge className="ml-auto bg-primary hover:bg-primary text-primary-foreground font-bold text-[10px] px-2 py-0.5">1 new</Badge>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-muted-foreground">
          <Search className="w-4 h-4" />
          <span className="text-xs font-medium">Search messages</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {/* Active (current scenario) row */}
        <div className="px-4 py-3 bg-primary/10 border-l-2 border-primary cursor-default flex items-center gap-3">
          <div className="rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 w-9 h-9 text-sm">
            {avatarGlyph}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-sm text-foreground truncate">{senderName}</span>
              <span className="text-[11px] font-bold text-primary shrink-0">{timestamp}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground truncate">{snippet}…</p>
          </div>
        </div>
        {/* Decoys */}
        {MESSAGE_DECOYS.map((d, i) => (
          <div key={i} className="px-4 py-3 opacity-60 cursor-default select-none flex items-center gap-3">
            <div className="rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center shrink-0 w-9 h-9 text-sm">
              {d.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium text-sm text-foreground truncate">{d.name}</span>
                <span className="text-[11px] font-medium text-muted-foreground shrink-0">{d.time}</span>
              </div>
              <p className="text-xs font-medium text-muted-foreground truncate">{d.snippet}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  const callLogList = () => (
    <Card className="border shadow-sm p-0 overflow-hidden flex flex-col h-[62vh] max-h-160">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/60 shrink-0">
        <PhoneCall className="w-5 h-5 text-primary" />
        <span className="font-display font-bold text-base">Recent Calls</span>
        <Badge className="ml-auto bg-primary hover:bg-primary text-primary-foreground font-bold text-[10px] px-2 py-0.5">1 new</Badge>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-muted-foreground">
          <Search className="w-4 h-4" />
          <span className="text-xs font-medium">Search calls</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        <div className="px-4 py-3 bg-primary/10 border-l-2 border-primary cursor-default flex items-center gap-3">
          <div className="rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 w-9 h-9 text-sm">
            <PhoneIncoming className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-sm text-foreground truncate">{senderName}</span>
              <span className="text-[11px] font-bold text-primary shrink-0">{timestamp}</span>
            </div>
            {/* Deliberately metadata only, not a transcript snippet: a real
                call log can't tell you what was said, and previewing the
                caller's opening line here would let the learner read it
                instead of listening for the tells in the delivery. */}
            <p className="text-xs font-medium text-muted-foreground truncate">Incoming call</p>
          </div>
        </div>
        {CALL_LOG_DECOYS.map((d, i) => (
          <div key={i} className="px-4 py-3 opacity-60 cursor-default select-none flex items-center gap-3">
            <div className="rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center shrink-0 w-9 h-9 text-sm">
              {d.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium text-sm text-foreground truncate">{d.name}</span>
                <span className="text-[11px] font-medium text-muted-foreground shrink-0">{d.time}</span>
              </div>
              <p className="text-xs font-medium text-muted-foreground truncate">{d.snippet}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  // A caught/missed/false red flag rendered as a hover trigger: hovering (or
  // focusing) it highlights the matching part of the email. Mirrors the landing
  // page InboxPreview's chip handlers, including the functional-update guard so
  // leaving one chip doesn't clear a highlight another chip just set.
  const cueTrigger = (id: string, tone: 'caught' | 'missed' | 'false') => {
    const toneClass =
      tone === 'caught'
        ? 'bg-success/10 text-success border-success/30'
        : tone === 'missed'
          ? 'bg-destructive/10 text-destructive border-destructive/30'
          : 'bg-warning/10 text-warning border-warning/30';
    return (
      <button
        key={id}
        type="button"
        onMouseEnter={() => setActiveCue(id)}
        onMouseLeave={() => setActiveCue((a) => (a === id ? null : a))}
        onFocus={() => setActiveCue(id)}
        onBlur={() => setActiveCue((a) => (a === id ? null : a))}
        className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Badge variant="outline" className={`font-bold transition-colors ${toneClass} ${activeCue === id ? 'ring-2 ring-destructive/50' : ''}`}>
          {getCueLabel(id)}
        </Badge>
      </button>
    );
  };

  // The graded-result card: correctness header, explanation, hover-highlight red
  // flags, calibration, rewards, and Next. Rendered in the right column beside
  // the email (no overlay modal).
  //
  // Takes the result as an argument rather than closing over the state: the only
  // call site is already behind a `result &&` guard, but a closure hides that
  // from the compiler, so reading it from scope needed a non-null assertion on
  // every one of the ~19 field accesses below.
  const resultCard = (result: AttemptResult) => (
    <Card className="border shadow-sm p-0 overflow-hidden flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header colored by correctness */}
      <div className={`pt-8 pb-5 px-6 text-center relative shrink-0 ${result.correct ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
        {result.leveledUp && <Sparkles className="absolute top-4 right-4 w-6 h-6 opacity-40" />}
        <div className="bg-background text-foreground w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-background/20">
          {result.correct ? <CheckCircle2 className="w-7 h-7 text-success" /> : <XCircle className="w-7 h-7 text-destructive" />}
        </div>
        <h2 className="text-2xl font-display font-bold mb-1 text-inherit">
          {result.correct ? "Correct" : "Incorrect"}
        </h2>
        <p className="font-medium opacity-90">
          {result.correctVerdict ? "You correctly identified the message." : "You missed the true intent of this message."}
        </p>
      </div>

      <div className="p-6 space-y-6 bg-background">
        {/* Explanation */}
        <div className="bg-muted/60 p-4 rounded-lg border border-border text-sm font-medium leading-relaxed">
          <p>{result.explanation}</p>
        </div>

        {/* Cue Feedback -- each flag is a hover trigger that highlights the email */}
        {verdict && (result.caughtCues.length > 0 || result.missedCues.length > 0 || result.falseCues.length > 0) && (
          <div className="space-y-3">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Your Analysis
              <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">(hover a flag to see it in the email)</span>
            </h4>

            {result.caughtCues.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-success mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Caught</p>
                <div className="flex flex-wrap gap-1">
                  {result.caughtCues.map((id: string) => cueTrigger(id, "caught"))}
                </div>
              </div>
            )}

            {result.missedCues.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1"><XCircle className="w-3 h-3"/> Missed</p>
                <div className="flex flex-wrap gap-1">
                  {result.missedCues.map((id: string) => cueTrigger(id, "missed"))}
                </div>
              </div>
            )}

            {result.falseCues.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-warning mb-1 flex items-center gap-1"><Info className="w-3 h-3"/> Incorrectly Flagged</p>
                <div className="flex flex-wrap gap-1">
                  {result.falseCues.map((id: string) => cueTrigger(id, "false"))}
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

      <div className="p-4 bg-muted/50 border-t shrink-0">
        <Button className="w-full py-6 text-lg font-bold rounded-lg shadow-sm group" onClick={resetAndNext}>
          Next Scenario
          <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </Card>
  );

  // The assistant surface, placed under the email in the LEFT column so it's
  // reachable without scrolling past the tall result card. Contains an on-page
  // answer card (when you tap "explain further") and the shared-conversation
  // chat. Called as {assistantColumn()} for stable reconcile.
  const assistantColumn = () => (
    <Card className="border shadow-sm p-0 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="font-display font-semibold text-sm">Ask the assistant</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-semibold h-7 text-xs"
          onClick={askAboutScenario}
          disabled={chat.isPending || explainIndex !== null}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {explainIndex !== null ? "Explained" : "Explain this scenario"}
        </Button>
      </div>

      {/* The assistant's scenario-specific answer surfaced on-page (no popup). */}
      {explainIndex !== null && (
        <div className="px-4 py-3 border-b border-border bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap text-foreground animate-in fade-in slide-in-from-bottom-2 duration-300">
          {chat.messages[explainIndex]?.content ?? (
            <span className="text-muted-foreground">Thinking…</span>
          )}
        </div>
      )}

      <div className="max-h-80 min-h-40 overflow-y-auto px-4 py-3">
        <ChatMessageList messages={chat.messages} isPending={chat.isPending} />
      </div>
      <ChatComposer
        draft={chat.draft}
        setDraft={chat.setDraft}
        onSubmit={(e) => { e.preventDefault(); chat.submitMessage(chat.draft); }}
        disabled={chat.isPending}
      />
    </Card>
  );

  return (
    // The feedback step widens to give the breakdown room. <main> no longer
    // caps width, so unlike before this transition actually has an effect.
    <PageShell
      width={step === 'feedback' ? '6xl' : '5xl'}
      className="space-y-0 h-full flex flex-col relative pb-12 transition-[max-width] duration-500"
    >
      <PageHeader
        icon={Target}
        title="Practice"
        className="mb-6 border-b-0 pb-0"
        actions={
          /* What to practice -- a specific vector, or Mixed to keep the
             original random-every-round behavior. */
          <div
            role="group"
            aria-label="Which channel to practice"
            className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-muted/60"
          >
            {VECTOR_FILTER_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={vectorFilter === value}
                onClick={() => handleVectorFilterChange(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  vectorFilter === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {step === 'inspect' ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
            <div className="hidden lg:block">
              {isVoice ? callLogList() : isSms ? messagesList() : inboxList()}
            </div>
            {isVoice ? voiceCallPane() : isSms ? smsThread() : mailClient()}
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
        <div className={`grid gap-6 items-start ${step === 'feedback' ? 'md:grid-cols-[1fr_440px]' : 'md:grid-cols-[1fr_400px]'}`}>
          {/* Left column: the email, plus (on feedback) the assistant right below
              it so it's reachable without scrolling past the tall result card. */}
          <div className="space-y-6">
            {isVoice ? voiceCallPane() : isSms ? smsThread() : mailClient()}
            {step === 'feedback' && result && assistantColumn()}
          </div>

          {/* Right column on feedback: the graded result, beside the email so you
              can compare against the message, and hover red flags to locate them
              in it -- all with no covering modal. */}
          {step === 'feedback' && result && (
            <div className="md:sticky md:top-24">
              {resultCard(result)}
            </div>
          )}

          {/* Side Panel for controls depending on step */}
          {step !== 'feedback' && (
            <Card className="border shadow-sm animate-in slide-in-from-right-8 duration-300 sticky top-24">
              <CardHeader variant="band">
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
                    <Button variant="ghost" className="w-full font-bold" onClick={handleBackToInspect}>
                      Back, change my verdict
                    </Button>
                  </div>
                )}

                {step === 'confidence' && (
                  <div className="space-y-8">
                    <div className="flex flex-col items-center justify-center p-6 bg-muted/60 rounded-lg border border-transparent">
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

    </PageShell>
  );
}
