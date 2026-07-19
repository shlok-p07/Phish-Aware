"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useGetLesson } from "@/api-client";
import { ArrowLeft, ArrowRight, CheckCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function LessonPage() {
  const params = useParams();
  const id = params.id as string;
  
  const { data: lesson, isLoading, isError } = useGetLesson(id);
  const [currentStep, setCurrentStep] = useState(0);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto h-[60vh] animate-pulse flex items-center justify-center">
        <div className="w-full h-96 bg-muted rounded-3xl" />
      </div>
    );
  }

  if (isError || !lesson) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 pt-12">
        <ShieldAlert className="w-12 h-12 text-destructive mx-auto" />
        <h2 className="text-2xl font-bold">Lesson not found</h2>
        <Button asChild variant="outline">
          <Link href="/learn">Back to Library</Link>
        </Button>
      </div>
    );
  }

  // Screens + final Red Flags summary screen
  const totalSteps = lesson.screens.length + 1;
  const isLastStep = currentStep === totalSteps - 1;

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild className="shrink-0 rounded-full hover:bg-muted">
          <Link href="/learn"><ArrowLeft className="w-5 h-5" /></Link>
        </Button>
        <div className="flex-1 space-y-2">
          <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>{lesson.title}</span>
            <span>{currentStep + 1} / {totalSteps}</span>
          </div>
          <Progress value={progress} className="h-2.5 bg-muted/50 [&>div]:bg-primary" />
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="border-2 shadow-md overflow-hidden min-h-[400px] flex flex-col animate-in fade-in zoom-in-95 duration-300">
        <CardContent className="flex-1 p-8 sm:p-12 flex flex-col justify-center">
          
          {!isLastStep && (
            <div className="space-y-6">
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground leading-tight">
                {lesson.screens[currentStep].heading}
              </h2>
              <div className="prose prose-lg dark:prose-invert prose-p:text-muted-foreground prose-p:font-medium prose-p:leading-relaxed">
                <p>{lesson.screens[currentStep].body}</p>
              </div>
            </div>
          )}

          {isLastStep && (
            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
              <div className="space-y-3">
                <div className="inline-flex bg-destructive/10 p-3 rounded-2xl mb-2 text-destructive">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-display font-bold">Top Red Flags</h2>
                <p className="text-muted-foreground font-medium text-lg">Always watch out for these cues in {lesson.vector} scams.</p>
              </div>
              
              <ul className="space-y-3">
                {lesson.redFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border-2 border-transparent hover:border-border transition-colors">
                    <CheckCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
                    <span className="font-semibold text-foreground text-lg leading-snug">{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="p-6 bg-muted/20 border-t-2 border-border flex justify-between gap-4">
          <Button 
            variant="outline" 
            size="lg" 
            onClick={prevStep} 
            disabled={currentStep === 0}
            className="rounded-xl border-2 font-bold w-1/3 shadow-sm"
          >
            Back
          </Button>
          
          {isLastStep ? (
            <Button size="lg" className="rounded-xl font-bold w-2/3 shadow-sm text-lg" asChild>
              <Link href="/practice">Put it to practice</Link>
            </Button>
          ) : (
            <Button size="lg" onClick={nextStep} className="rounded-xl font-bold w-2/3 shadow-sm text-lg group">
              Continue
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}