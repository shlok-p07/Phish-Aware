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
  ShieldAlert, ShieldCheck, HelpCircle, ArrowRight, Target, 
  CheckCircle2, XCircle, Info, Sparkles 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Define the steps of the practice loop
type PracticeStep = 'inspect' | 'cues' | 'confidence' | 'feedback';

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
      <div className="max-w-4xl mx-auto h-[60vh] flex flex-col justify-center gap-6 p-4">
        <div className="h-16 w-1/3 bg-muted rounded-2xl animate-pulse" />
        <div className="h-[400px] w-full bg-muted rounded-3xl animate-pulse" />
      </div>
    );
  }

  if (isScenarioError || !scenario || !availableCues) {
    return (
      <Card className="max-w-xl mx-auto mt-12 border-2 border-destructive/20 bg-destructive/5">
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

  // The main message card rendered for all states to keep context
  const MessageCard = () => (
    <Card className={`border-2 shadow-sm flex flex-col ${step === 'inspect' ? 'h-[60vh] max-h-[600px]' : 'h-auto max-h-[300px]'} transition-all duration-500 overflow-hidden`}>
      <CardHeader className="bg-muted/30 border-b-2 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="outline" className="font-bold text-xs uppercase shadow-none border-muted-foreground/30 text-muted-foreground">
            {scenario.vector}
          </Badge>
          <Badge variant="secondary" className="font-bold text-xs uppercase bg-background shadow-sm border-2">
            Diff: {scenario.difficulty}
          </Badge>
        </div>
        <h3 className="font-bold text-xl leading-tight">{scenario.subject}</h3>
        <p className="text-sm font-medium text-muted-foreground mt-1">
          From: <span className="text-foreground">{scenario.sender}</span>
        </p>
        {scenario.attachmentName && (
          <div className="mt-3 flex items-center gap-2 text-sm font-medium bg-background border-2 p-2 rounded-lg inline-flex text-primary">
            <span className="opacity-70 text-xs">📎</span> {scenario.attachmentName}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="flex-1 p-6 md:p-8 font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap bg-background">
        {scenario.body}
        
        {scenario.links.length > 0 && (
          <div className="mt-6 space-y-2 border-t-2 border-dashed pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">Links in message:</p>
            {scenario.links.map((link, idx) => (
              <div key={idx} className="bg-muted/30 border-2 p-2 rounded-lg text-primary text-xs break-all relative group cursor-help transition-colors hover:bg-muted/50">
                <span className="underline decoration-dashed decoration-primary/50">{link}</span>
                <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 bg-foreground text-background text-xs p-2 rounded-md z-10 break-all w-full shadow-lg">
                  Destination URL: {link}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col relative pb-12 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <Target className="w-8 h-8 text-primary" />
          Practice Range
        </h1>
      </div>

      <div className={`grid gap-6 ${step === 'inspect' ? 'grid-cols-1' : 'md:grid-cols-[1fr_400px] items-start'}`}>
        
        <div className={step === 'inspect' ? 'max-w-2xl mx-auto w-full' : 'w-full'}>
          <MessageCard />
        </div>

        {/* Side Panel for controls depending on step */}
        {step !== 'inspect' && step !== 'feedback' && (
          <Card className="border-2 shadow-sm animate-in slide-in-from-right-8 duration-300 sticky top-24">
            <CardHeader className="bg-muted/30 border-b-2 pb-4">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground mb-2">
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
                          className={`text-sm font-semibold px-3 py-2 rounded-xl border-2 transition-all ${
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
                    className="w-full mt-4 py-6 rounded-xl font-bold" 
                    onClick={() => setStep('confidence')}
                  >
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {step === 'confidence' && (
                <div className="space-y-8">
                  <div className="flex flex-col items-center justify-center p-6 bg-muted/30 rounded-2xl border-2 border-transparent">
                    <span className="text-5xl font-display font-bold text-primary mb-2">{confidence}%</span>
                    <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Confidence</span>
                  </div>
                  
                  <Slider 
                    value={[confidence]} 
                    onValueChange={(v) => setConfidence(v[0])} 
                    max={100} 
                    step={5}
                    className="py-4"
                  />
                  
                  <div className="flex justify-between text-xs font-bold text-muted-foreground">
                    <span>Just guessing (0%)</span>
                    <span>Absolutely sure (100%)</span>
                  </div>

                  <Button 
                    className="w-full py-6 rounded-xl font-bold text-lg shadow-sm" 
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

      {/* Initial Inspect Controls */}
      {step === 'inspect' && (
        <div className="max-w-2xl mx-auto w-full mt-6 flex flex-col gap-4">
          <p className="text-center font-display font-bold text-xl mb-2 text-foreground">
            Is this Phishing or Legitimate?
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Button 
              size="lg" 
              variant="outline" 
              className="py-10 border-2 border-destructive/20 bg-destructive/5 hover:bg-destructive hover:text-destructive-foreground text-destructive font-bold text-xl rounded-2xl transition-all shadow-sm"
              onClick={() => handleVerdict(true)}
            >
              <ShieldAlert className="mr-3 w-7 h-7" />
              Phishing
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="py-10 border-2 border-success/20 bg-success/5 hover:bg-success hover:text-success-foreground text-success font-bold text-xl rounded-2xl transition-all shadow-sm"
              onClick={() => handleVerdict(false)}
            >
              <ShieldCheck className="mr-3 w-7 h-7" />
              Legitimate
            </Button>
          </div>
        </div>
      )}

      {/* Feedback Dialog */}
      <Dialog open={step === 'feedback'} onOpenChange={() => {}}>
        <DialogContent className="max-w-md p-0 border-2 overflow-hidden rounded-3xl gap-0 [&>button]:hidden">
          {result && (
            <>
              {/* Header colored by correctness */}
              <div className={`pt-10 pb-6 px-6 text-center relative ${result.correct ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                {result.leveledUp && <Sparkles className="absolute top-4 right-4 w-8 h-8 opacity-50 animate-pulse" />}
                <div className="bg-background text-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border-4 border-background/20">
                  {result.correct ? <CheckCircle2 className={`w-8 h-8 text-success`} /> : <XCircle className={`w-8 h-8 text-destructive`} />}
                </div>
                <DialogTitle className="text-3xl font-display font-bold mb-1 text-inherit">
                  {result.correct ? "Spot On!" : "Not Quite."}
                </DialogTitle>
                <p className="font-medium opacity-90 text-lg">
                  {result.correctVerdict ? "You correctly identified the message." : "You missed the true intent of this message."}
                </p>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto bg-background">
                {/* AI Explanation */}
                <div className="bg-muted/30 p-4 rounded-2xl border-2 border-border text-sm font-medium leading-relaxed">
                  {result.explanation}
                </div>

                {/* Cue Feedback (Only if it was a phishing scenario and they had to pick cues) */}
                {verdict && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Your Analysis</h4>
                    
                    {result.caughtCues.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-success mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Caught</p>
                        <div className="flex flex-wrap gap-1">
                          {result.caughtCues.map((id: string) => <Badge key={id} variant="outline" className="bg-success/10 text-success border-success/30 font-bold">{getCueLabel(id)}</Badge>)}
                        </div>
                      </div>
                    )}
                    
                    {result.missedCues.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-destructive mb-1 flex items-center gap-1"><XCircle className="w-3 h-3"/> Missed</p>
                        <div className="flex flex-wrap gap-1">
                          {result.missedCues.map((id: string) => <Badge key={id} variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 font-bold">{getCueLabel(id)}</Badge>)}
                        </div>
                      </div>
                    )}

                    {result.falseCues.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-orange-500 mb-1 flex items-center gap-1"><Info className="w-3 h-3"/> Incorrectly Flagged</p>
                        <div className="flex flex-wrap gap-1">
                          {result.falseCues.map((id: string) => <Badge key={id} variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 font-bold">{getCueLabel(id)}</Badge>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Calibration */}
                <div className="bg-primary/5 p-4 rounded-2xl border-2 border-primary/20 flex items-start gap-3 text-sm font-medium text-foreground">
                  <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p>{result.calibrationNote}</p>
                </div>

                {/* Rewards */}
                <div className="flex items-center justify-between border-t-2 pt-4">
                  <div className="space-y-0.5">
                     <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">XP Earned</p>
                     <p className="text-2xl font-display font-bold text-primary">+{result.xpAwarded}</p>
                  </div>
                  {result.leveledUp && (
                     <Badge className="bg-primary hover:bg-primary font-bold px-3 py-1 text-sm shadow-sm animate-bounce">Level Up! {result.level}</Badge>
                  )}
                </div>
              </div>

              <DialogFooter className="p-4 bg-muted/20 border-t-2">
                <Button className="w-full py-6 text-lg font-bold rounded-xl shadow-sm group" onClick={resetAndNext}>
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