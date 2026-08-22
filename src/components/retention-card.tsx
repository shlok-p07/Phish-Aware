"use client";

import Link from "next/link";
import { BrainCircuit, CircleCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/**
 * What the learner has actually banked, and what is coming back up.
 *
 * The dashboard's other numbers stop being feedback: lifetime detection
 * accuracy barely moves after a few dozen attempts, and total scenarios only
 * ever goes up. Neither answers "what should I do next", so there was nothing on
 * the page that changed between one session and the next.
 *
 * Mastery does change. A red flag needs a run of correct answers before it
 * counts, and it drops back out if it is later missed, so this card is different
 * every time -- and when something comes due it names the thing to work on
 * rather than leaving the learner to guess.
 */
export interface RetentionTargetView {
  label: string;
  streak: number;
  mastered: boolean;
  due: boolean;
}

export interface RetentionSummaryView {
  mastered: number;
  due: number;
  tracked: number;
  masteryStreak: number;
  nextDueAt?: string | null;
  masteredTargets: string[];
  dueTargets: string[];
  targets?: RetentionTargetView[];
}

/**
 * "in 3 days" / "tomorrow", from an ISO timestamp.
 *
 * Deliberately coarse. An exact clock time implies the schedule is precise to
 * the minute, which would be a promise the interval arithmetic does not make.
 */
export function describeNextDue(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const days = Math.ceil((at.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "in about a week" : `in about ${weeks} weeks`;
}

export function RetentionCard({ retention }: { retention: RetentionSummaryView }) {
  const { mastered, due, tracked, masteredTargets, dueTargets } = retention;
  const targets = retention.targets ?? [];
  const nextDue = describeNextDue(retention.nextDueAt);

  // Nothing tracked yet means they have not practised. Saying "0 mastered"
  // to someone on their first visit reads as a failure rather than a start.
  if (tracked === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader variant="band">
          <CardTitle className="text-lg flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            Red flags mastered
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <p className="pa-measure text-sm text-muted-foreground">
            Every red flag you spot gets tracked here. Get one right{" "}
            {retention.masteryStreak} times in a row and it counts as mastered. Miss it later and
            it comes back around until it sticks.
          </p>
          <Button asChild size="sm" className="rounded-lg font-semibold">
            <Link href="/practice">Start practising</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="text-lg flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-primary" />
          Red flags mastered
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-3xl font-bold tabular-nums">
              {mastered}
              <span className="text-base font-semibold text-muted-foreground">/{tracked}</span>
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              {retention.masteryStreak} in a row to master
            </p>
          </div>
          <Progress value={(mastered / tracked) * 100} className="h-1.5" />
        </div>

        {/* Per-target progress, not just a count. Mastery needs three correct
            answers in a row, so without this a learner who had genuinely
            improved still saw a flat zero and assumed the feature was broken. */}
        {targets.length > 0 ? (
          <ul className="space-y-1.5">
            {targets.slice(0, 6).map((target) => (
              <li key={target.label} className="flex items-center gap-2.5 text-sm">
                {target.mastered ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30"
                    aria-hidden="true"
                  />
                )}
                <span className={`min-w-0 flex-1 truncate ${target.mastered ? "text-muted-foreground line-through decoration-1" : ""}`}>
                  {target.label}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {target.mastered ? "Mastered" : `${target.streak}/${retention.masteryStreak}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          masteredTargets.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {masteredTargets.map((label) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
                >
                  <CircleCheck className="h-3 w-3" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          )
        )}

        {due > 0 ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Coming back up ({due})
            </p>
            {/* Named, not counted: "two things are due" is not actionable. */}
            <p className="pa-measure text-sm">{dueTargets.join(" · ")}</p>
            <Button asChild size="sm" className="rounded-lg font-semibold">
              <Link href="/practice">Practise these</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {nextDue
              ? `Nothing due right now. Your next review comes up ${nextDue}.`
              : "Nothing due right now."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
