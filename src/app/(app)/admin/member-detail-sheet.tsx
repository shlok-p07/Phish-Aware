"use client";
import { AlertTriangle, Target, Gauge, ClipboardList } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetOrgMemberDetail } from "@/api-client";
import { titleCase } from "@/lib/utils";

/**
 * One member, in enough detail for an admin to act on.
 *
 * The members table gave a name, an accuracy figure and a risk badge -- which
 * says somebody needs help without saying what kind. This answers the next
 * question: which cues they miss, which vectors they miss them on, whether their
 * confidence tracks their competence, and what training they still owe.
 *
 * Fetched on open rather than per row, so a table of members is still one
 * request.
 */
const riskTone: Record<string, string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-destructive",
};

const statusTone: Record<string, string> = {
  overdue: "text-destructive",
  completed: "text-success",
  in_progress: "text-warning",
  assigned: "text-muted-foreground",
};

export function MemberDetailSheet({
  memberId,
  onOpenChange,
}: {
  memberId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useGetOrgMemberDetail(memberId ?? "", {
    query: { enabled: memberId !== null },
  });

  return (
    <Sheet open={memberId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading || !data ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{data.name}</SheetTitle>
              <SheetDescription>
                {data.email ?? "No email on file"}
                {data.department ? ` · ${data.department}` : " · No department"}
                {` · ${titleCase(data.role)}`}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat icon={Target} label="Accuracy" value={`${data.accuracy}%`} />
              <Stat
                icon={Gauge}
                label="Calibration"
                value={`${data.calibrationScore}%`}
                hint="How well their confidence matches their results"
              />
              <Stat
                icon={AlertTriangle}
                label="Risk"
                value={titleCase(data.risk)}
                tone={riskTone[data.risk]}
              />
            </div>

            {data.totalAttempts === 0 ? (
              <p className="pa-measure mt-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                No practice yet, which is why they read as high risk. Somebody
                unproven is exactly who a campaign should reach.
              </p>
            ) : (
              <>
                <Section title="Weakest cues" hint="Ranked worst first">
                  {data.cueAccuracy.length === 0 ? (
                    <Empty>No cues recorded yet.</Empty>
                  ) : (
                    <ul className="space-y-2.5">
                      {data.cueAccuracy.map((cue) => (
                        <li key={cue.cueId} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-semibold">{cue.label}</span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {cue.rate}% of {cue.attempts}
                            </span>
                          </div>
                          <Progress value={cue.rate} className="h-1.5" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="By vector">
                  {data.vectorAccuracy.length === 0 ? (
                    <Empty>No attempts attributed to a vector yet.</Empty>
                  ) : (
                    <ul className="space-y-2.5">
                      {data.vectorAccuracy.map((row) => (
                        <li key={row.vector} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-semibold capitalize">{row.vector}</span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {row.rate}% of {row.attempts}
                            </span>
                          </div>
                          <Progress value={row.rate} className="h-1.5" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )}

            <Section title="Assigned training" icon={ClipboardList}>
              {data.assignments.length === 0 ? (
                <Empty>Nothing assigned.</Empty>
              ) : (
                <ul className="space-y-2">
                  {data.assignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
                    >
                      <span className="font-semibold truncate">{a.title}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {a.requiredScenarios > 0
                          ? `${a.completedScenarios}/${a.requiredScenarios}`
                          : `${a.completedScenarios}`}
                      </span>
                      <span className={`shrink-0 font-semibold ${statusTone[a.status] ?? ""}`}>
                        {a.status === "in_progress" ? "In progress" : titleCase(a.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3" title={hint}>
      <Icon className="mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <p className={`text-lg font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: typeof Target;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden="true" />}
        {title}
        {hint && <span className="font-medium text-muted-foreground">· {hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
