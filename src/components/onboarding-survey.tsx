"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  stripEmpty,
  validateSurveyAnswers,
  visibleQuestions,
  visibleSections,
  type OnboardingSurveyAnswerMap,
  type SurveyQuestion,
} from "@/lib/onboarding-survey";

type Props = {
  onComplete: (answers: OnboardingSurveyAnswerMap) => void;
  isSubmitting?: boolean;
  /** Pre-fills previously-entered answers when someone navigates back to this step. */
  initialAnswers?: OnboardingSurveyAnswerMap;
  /**
   * Set when the org pinned a department to this user's invitation. The
   * department question is then skipped -- see visibleQuestions().
   */
  presetDepartment?: string | null;
};

export function OnboardingSurvey({
  onComplete,
  isSubmitting,
  initialAnswers,
  presetDepartment,
}: Props) {
  const [draft, setDraft] = useState<OnboardingSurveyAnswerMap>(initialAnswers ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const context = { presetDepartment };
  const sections = visibleSections(draft, context);
  const asked = visibleQuestions(draft, context);
  const answered = asked.filter((q) => (draft[q.id] ?? "") !== "").length;

  const setAnswer = (id: string, value: string) => {
    setDraft((prev) => ({ ...prev, [id]: value }));
    // Clear the error as soon as they touch the question again.
    setErrors((prev) => (prev[id] ? { ...prev, [id]: "" } : prev));
  };

  const handleSubmit = () => {
    const found = validateSurveyAnswers(draft, context);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = asked.find((q) => found[q.id]);
      if (first) {
        document
          .getElementById(`question-${first.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    onComplete(stripEmpty(draft));
  };

  /*
   * Numbering runs across sections so it reads as one survey, not five.
   *
   * Precomputed as a per-section starting offset rather than a counter bumped
   * inside the render callbacks: those callbacks outlive the render pass, so
   * incrementing a local from them is a reassignment after render completes.
   */
  const sectionOffsets: number[] = [];
  sections.reduce((runningTotal, section) => {
    sectionOffsets.push(runningTotal);
    return runningTotal + section.questions.length;
  }, 0);

  return (
    <Card className="border shadow-sm animate-in slide-in-from-bottom-8 duration-300">
      <CardContent className="p-6 md:p-8 space-y-10">
        {sections.map((section, sectionIndex) => (
          <section key={section.id} className="space-y-6">
            <div className="space-y-1 border-b pb-3">
              <h2 className="text-lg font-display font-bold">{section.title}</h2>
              <p className="text-sm font-medium text-muted-foreground">{section.blurb}</p>
            </div>
            {section.questions.map((question, questionIndex) => (
              <QuestionField
                key={question.id}
                question={question}
                number={sectionOffsets[sectionIndex] + questionIndex + 1}
                value={draft[question.id] ?? ""}
                error={errors[question.id]}
                onChange={(value) => setAnswer(question.id, value)}
              />
            ))}
          </section>
        ))}
      </CardContent>
      <CardFooter className="border-t bg-background p-6 rounded-b-xl flex-col gap-4 items-stretch">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {answered} of {asked.length} answered
          </p>
          <Progress value={(answered / asked.length) * 100} className="h-2" />
        </div>
        <Button
          size="lg"
          className="w-full py-6 text-lg font-bold rounded-lg shadow-sm group"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          Continue to diagnostic
          <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardFooter>
    </Card>
  );
}

type FieldProps = {
  question: SurveyQuestion;
  number: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function QuestionField({ question, number, value, error, onChange }: FieldProps) {
  const inputId = `survey-${question.id}`;

  return (
    <div id={`question-${question.id}`} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={inputId} className="text-base font-bold leading-snug">
          <span className="text-muted-foreground mr-2">{number}.</span>
          {question.prompt}
        </Label>
        {question.helper && (
          <p className="text-sm font-medium text-muted-foreground">
            {question.helper}
          </p>
        )}
      </div>

      {question.type === "select" && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={inputId} className="w-full max-w-sm">
            <SelectValue placeholder="Select an answer" />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {question.type === "boolean" && (
        <RadioGroup value={value} onValueChange={onChange} className="flex gap-6">
          {[
            { answer: "1", label: question.yesLabel ?? "Yes" },
            { answer: "0", label: question.noLabel ?? "No" },
          ].map(({ answer, label }) => (
            <div key={answer} className="flex items-center gap-2">
              <RadioGroupItem value={answer} id={`${inputId}-${answer}`} />
              <Label htmlFor={`${inputId}-${answer}`} className="font-medium cursor-pointer">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {question.type === "integer" && (
        <div className="flex items-center gap-3">
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={question.min}
            max={question.max}
            value={value}
            placeholder="0"
            className="max-w-32"
            // Strip anything that isn't a digit so the stored answer stays
            // parseable -- number inputs happily accept "1e5" and "-".
            onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          />
          <span className="text-sm font-medium text-muted-foreground">{question.unit}</span>
        </div>
      )}

      {question.type === "scale" && (
        <div className="max-w-md space-y-2">
          <Slider
            id={inputId}
            // Unanswered sliders park at the midpoint but stay unset until
            // touched, so nobody is silently credited with a 50.
            value={[value === "" ? 50 : Number(value)]}
            min={0}
            max={100}
            step={5}
            aria-label={question.prompt}
            onValueChange={([next]) => onChange(String(next))}
          />
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{question.lowLabel}</span>
            <span className="font-bold text-foreground">
              {value === "" ? "Not answered" : `${value}%`}
            </span>
            <span>{question.highLabel}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm font-semibold text-destructive">{error}</p>
      )}
    </div>
  );
}
