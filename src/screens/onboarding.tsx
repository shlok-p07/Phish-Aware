"use client";
import { useState, useEffect } from "react";
import { useLocation } from "@/lib/nav";
import { useGetOnboardingQuiz, useSubmitOnboardingQuiz, useGetCurrentUser, getGetCurrentUserQueryKey } from "@/api-client";
import { Shield, ArrowRight, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: user } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  
  const { data: quizQuestions, isLoading: isQuizLoading } = useGetOnboardingQuiz();
  const submitQuiz = useSubmitOnboardingQuiz();

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<{scenarioId: string, verdict: boolean}[]>([]);
  const [result, setResult] = useState<any>(null);

  // If already onboarded, send away.
  useEffect(() => {
    if (user) {
      const hasOnboarded = localStorage.getItem(`onboardingCompleted_${user.id}`);
      if (hasOnboarded) {
        setLocation("/dashboard");
      }
    }
  }, [user, setLocation]);

  if (isQuizLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse bg-muted w-96 h-64 rounded-3xl" /></div>;
  }

  if (!quizQuestions || quizQuestions.length === 0) {
    return <div className="min-h-screen flex items-center justify-center">Failed to load diagnostic.</div>;
  }

  const handleAnswer = (verdict: boolean) => {
    const currentQ = quizQuestions[currentStep];
    const newAnswers = [...answers, { scenarioId: currentQ.id, verdict }];
    setAnswers(newAnswers);

    if (currentStep < quizQuestions.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Submit the quiz
      submitQuiz.mutate({ data: { answers: newAnswers } }, {
        onSuccess: (res) => {
          if (user) localStorage.setItem(`onboardingCompleted_${user.id}`, 'true');
          setResult(res);
        },
        onError: () => {
          toast({ title: "Error submitting", variant: "destructive" });
        }
      });
    }
  };

  const finishOnboarding = () => {
    setLocation("/dashboard");
  };

  if (result) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full border-2 shadow-lg text-center animate-in zoom-in-95 duration-500 overflow-hidden">
          <div className="bg-primary pt-12 pb-8 px-6 text-primary-foreground relative">
            <Sparkles className="w-16 h-16 absolute top-4 right-4 opacity-20 animate-pulse" />
            <div className="bg-background text-primary w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-inner mb-6 border-4 border-primary-foreground/20">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-display font-bold mb-2">Diagnostic Complete!</h2>
            <p className="text-primary-foreground/90 font-medium text-lg">
              You scored {result.correctCount} out of {result.totalCount}
            </p>
          </div>
          <CardContent className="pt-8 pb-8 space-y-4">
            <p className="text-muted-foreground font-medium text-lg">
              Based on your answers, we're starting you at:
            </p>
            <div className="inline-block bg-muted px-6 py-3 rounded-2xl">
               <span className="text-2xl font-bold capitalize text-foreground">{result.level} Level</span>
            </div>
            <p className="text-sm text-muted-foreground px-4">
              Don't worry about the score—the whole point is to practice in a safe environment. We'll tailor your scenarios to help you grow.
            </p>
          </CardContent>
          <CardFooter className="pb-8">
            <Button size="lg" className="w-full py-6 text-lg font-bold rounded-xl shadow-sm group" onClick={finishOnboarding}>
              Go to Dashboard
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const currentQ = quizQuestions[currentStep];
  const progress = (currentStep / quizQuestions.length) * 100;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/30">
      <div className="max-w-3xl w-full mx-auto px-4 py-8 flex-1 flex flex-col">
        
        <div className="mb-8 text-center space-y-4">
          <div className="flex justify-center mb-2">
             <div className="bg-primary/10 p-3 rounded-2xl text-primary">
               <Shield className="w-8 h-8" />
             </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Quick Diagnostic</h1>
          <p className="text-muted-foreground font-medium max-w-lg mx-auto">
            Take a guess at these 5 messages. This helps us set your starting difficulty.
          </p>
          
          <div className="max-w-md mx-auto mt-6">
            <div className="flex justify-between text-xs font-bold text-muted-foreground mb-2">
              <span>Question {currentStep + 1} of {quizQuestions.length}</span>
            </div>
            <Progress value={progress} className="h-3 bg-muted-foreground/20" />
          </div>
        </div>

        <Card className="flex-1 flex flex-col border-2 shadow-sm animate-in slide-in-from-bottom-8 duration-300">
          <CardHeader className="bg-background border-b-2 px-6 py-4 flex-shrink-0 rounded-t-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                 <span className="text-xs font-bold uppercase tracking-wider bg-muted px-2 py-1 rounded-md text-muted-foreground">{currentQ.vector}</span>
              </div>
              <h3 className="font-bold text-lg leading-tight mt-2">{currentQ.subject}</h3>
              <p className="text-sm font-medium text-muted-foreground">From: <span className="text-foreground">{currentQ.sender}</span></p>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-6 md:p-8 bg-muted/10 font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap">
            {currentQ.body}
            
            {currentQ.links.length > 0 && (
              <div className="mt-6 space-y-2 border-t-2 border-dashed pt-4">
                <p className="text-xs font-bold text-muted-foreground uppercase">Links in message (hover to inspect):</p>
                {currentQ.links.map((link, idx) => (
                  <div key={idx} className="bg-background border-2 p-2 rounded-lg text-primary text-xs break-all cursor-help relative group">
                    <span className="underline decoration-dashed decoration-primary/50">{link}</span>
                    <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 bg-foreground text-background text-xs p-2 rounded-md z-10 break-all w-full shadow-lg">
                      Destination: {link}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-background p-4 md:p-6 border-t-2 grid grid-cols-2 gap-4 rounded-b-xl flex-shrink-0">
            <Button 
              size="lg" 
              variant="outline" 
              className="py-8 border-2 border-destructive/20 bg-destructive/5 hover:bg-destructive hover:text-destructive-foreground text-destructive font-bold text-lg rounded-2xl transition-all"
              onClick={() => handleAnswer(true)}
              disabled={submitQuiz.isPending}
            >
              <ShieldAlert className="mr-2 w-6 h-6" />
              Phishing
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="py-8 border-2 border-success/20 bg-success/5 hover:bg-success hover:text-success-foreground text-success font-bold text-lg rounded-2xl transition-all"
              onClick={() => handleAnswer(false)}
              disabled={submitQuiz.isPending}
            >
              <ShieldCheck className="mr-2 w-6 h-6" />
              Legitimate
            </Button>
          </CardFooter>
        </Card>

      </div>
    </div>
  );
}