"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGetOnboardingQuiz, useSubmitOnboardingQuiz, useGetCurrentUser, getGetCurrentUserQueryKey } from "@/api-client";
import type { OnboardingResult } from "@/api-client";
import { Shield, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });

  const { data: quizQuestions, isLoading: isQuizLoading } = useGetOnboardingQuiz();
  const submitQuiz = useSubmitOnboardingQuiz();

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<{scenarioId: string, verdict: boolean}[]>([]);
  const [result, setResult] = useState<OnboardingResult | null>(null);

  // If already onboarded, send away.
  useEffect(() => {
    if (user?.onboardingCompleted) {
      router.push("/dashboard");
    }
  }, [user, router]);

  if (isQuizLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse bg-muted w-96 h-64 rounded-lg" /></div>;
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
          // The server marked onboarding complete; refresh the cached user so the
          // app-layout gate (which reads user.onboardingCompleted) lets us through.
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          setResult(res);
        },
        onError: () => {
          toast({ title: "Error submitting", variant: "destructive" });
        }
      });
    }
  };

  const finishOnboarding = () => {
    router.push("/dashboard");
  };

  if (result) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full border shadow-md text-center animate-in fade-in duration-300 overflow-hidden">
          <div className="pt-10 pb-6 px-6 border-b border-border">
            <div className="bg-primary/10 text-primary w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-1">Diagnostic complete</h2>
            <p className="text-muted-foreground font-medium">
              You scored {result.correctCount} out of {result.totalCount}
            </p>
          </div>
          <CardContent className="pt-8 pb-8 space-y-4">
            <p className="text-muted-foreground font-medium text-lg">
              Based on your answers, we're starting you at:
            </p>
            <div className="inline-block bg-muted px-6 py-3 rounded-lg">
               <span className="text-2xl font-bold capitalize text-foreground">{result.level} Level</span>
            </div>
            <p className="text-sm text-muted-foreground px-4">
              Don't worry about the score—the whole point is to practice in a safe environment. We'll tailor your scenarios to help you grow.
            </p>
          </CardContent>
          <CardFooter className="pb-8">
            <Button size="lg" className="w-full py-6 text-lg font-bold rounded-lg shadow-sm group" onClick={finishOnboarding}>
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
    <div className="min-h-dvh flex flex-col bg-muted/30">
      <div className="max-w-3xl w-full mx-auto px-4 py-8 flex-1 flex flex-col">
        
        <div className="mb-8 text-center space-y-4">
          <div className="flex justify-center mb-2">
             <div className="bg-primary/10 p-3 rounded-lg text-primary">
               <Shield className="w-8 h-8" />
             </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Quick Diagnostic</h1>
          <p className="text-muted-foreground font-medium max-w-lg mx-auto">
            Take a guess at these 5 messages. This helps us set your starting difficulty.
          </p>
          
          <div className="max-w-md mx-auto mt-6">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-2">
              <span>Question {currentStep + 1} of {quizQuestions.length}</span>
            </div>
            <Progress value={progress} className="h-3 bg-muted-foreground/20" />
          </div>
        </div>

        <Card className="flex-1 flex flex-col border shadow-sm animate-in slide-in-from-bottom-8 duration-300">
          <CardHeader className="bg-background border-b px-6 py-4 shrink-0 rounded-t-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                 <span className="text-xs font-semibold uppercase tracking-wider bg-muted px-2 py-1 rounded-md text-muted-foreground">{currentQ.vector}</span>
              </div>
              <h3 className="font-bold text-lg leading-tight mt-2">{currentQ.subject}</h3>
              <p className="text-sm font-medium text-muted-foreground">From: <span className="text-foreground">{currentQ.sender}</span></p>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-6 md:p-8 bg-muted/10 font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap">
            {currentQ.body}
            
            {currentQ.links.length > 0 && (
              <div className="mt-6 space-y-2 border-t border-dashed pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Links in message (hover to inspect):</p>
                {currentQ.links.map((link, idx) => (
                  <div key={idx} className="bg-background border p-2 rounded-lg text-primary text-xs break-all cursor-help relative group">
                    <span className="underline decoration-dashed decoration-primary/50">{link.text}</span>
                    <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 bg-foreground text-background text-xs p-2 rounded-md z-10 break-all w-full shadow-lg">
                      Destination: {link.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-background p-4 md:p-6 border-t grid grid-cols-2 gap-4 rounded-b-xl shrink-0">
            <Button 
              size="lg" 
              variant="outline" 
              className="py-8 border border-destructive/20 bg-destructive/5 hover:bg-destructive hover:text-destructive-foreground text-destructive font-bold text-lg rounded-lg transition-all"
              onClick={() => handleAnswer(true)}
              disabled={submitQuiz.isPending}
            >
              <ShieldAlert className="mr-2 w-6 h-6" />
              Phishing
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="py-8 border border-success/20 bg-success/5 hover:bg-success hover:text-success-foreground text-success font-bold text-lg rounded-lg transition-all"
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