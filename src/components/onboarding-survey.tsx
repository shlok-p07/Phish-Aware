"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ONBOARDING_SURVEY_QUESTIONS,
  stripEmpty,
  validateSurveyAnswers,
  type OnboardingSurveyAnswerMap,
  type SurveyQuestion,
} from "@/lib/onboarding-survey";

type Props = {
  onComplete: (answers: OnboardingSurveyAnswerMap) => void;
  isSubmitting?: boolean;
};

export function OnboardingSurvey({ onComplete, isSubmitting }: Props) {
  const [draft, setDraft] = useState<OnboardingSurveyAnswerMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setAnswer = (id: string, value: string) => {
    setDraft((prev) => ({ ...prev, [id]: value }));
    // Clear the error as soon as they touch the question again.
    setErrors((prev) => (prev[id] ? { ...prev, [id]: "" } : prev));
  };

  const handleSubmit = () => {
    const found = validateSurveyAnswers(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = ONBOARDING_SURVEY_QUESTIONS.find((q) => found[q.id]);
      if (first) {
        document
          .getElementById(`question-${first.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    onComplete(stripEmpty(draft));
  };

  return (
    <Card className="border shadow-sm animate-in slide-in-from-bottom-8 duration-300">
      <CardContent className="p-6 md:p-8 space-y-8">
        {ONBOARDING_SURVEY_QUESTIONS.map((question, idx) => (
          <QuestionField
            key={question.id}
            question={question}
            index={idx}
            value={draft[question.id] ?? ""}
            error={errors[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
          />
        ))}
      </CardContent>
      <CardFooter className="border-t bg-background p-6 rounded-b-xl">
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
  index: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function QuestionField({ question, index, value, error, onChange }: FieldProps) {
  const inputId = `survey-${question.id}`;

  return (
    <div id={`question-${question.id}`} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={inputId} className="text-base font-bold leading-snug">
          <span className="text-muted-foreground mr-2">{index + 1}.</span>
          {question.prompt}
          {!question.required && (
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              (optional)
            </span>
          )}
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

      {question.type === "radio" && (
        <RadioGroup value={value} onValueChange={onChange} className="space-y-2">
          {question.options.map((option) => (
            <div key={option} className="flex items-center gap-3">
              <RadioGroupItem
                value={option}
                id={`${inputId}-${slug(option)}`}
              />
              <Label
                htmlFor={`${inputId}-${slug(option)}`}
                className="font-medium cursor-pointer"
              >
                {option}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {question.type === "text" && (
        <Input
          id={inputId}
          value={value}
          maxLength={question.maxLength}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {question.type === "textarea" && (
        <div className="space-y-1">
          <Textarea
            id={inputId}
            value={value}
            maxLength={question.maxLength}
            placeholder={question.placeholder}
            rows={4}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="text-xs font-medium text-muted-foreground text-right">
            {value.length}/{question.maxLength}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm font-semibold text-destructive">{error}</p>
      )}
    </div>
  );
}

function slug(option: string) {
  return option.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
