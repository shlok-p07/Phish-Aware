"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Clock, AlertTriangle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useGetOrgTrainingDetail } from "@/api-client";

/**
 * Who has actually completed a campaign.
 *
 * An admin could assign mandatory training and had no way to find out whether
 * anybody did it -- the campaign route only supported DELETE. Fetched on expand
 * rather than for every row, so a page of campaigns is still one request.
 *
 * Progress comes from the same server-side helper the employee's own view uses,
 * so an admin is never chasing somebody the app has already told is finished.
 */
const STATUS = {
  overdue: { label: "Overdue", icon: AlertTriangle, tone: "text-destructive" },
  assigned: { label: "Not started", icon: Circle, tone: "text-muted-foreground" },
  in_progress: { label: "In progress", icon: Clock, tone: "text-warning" },
  completed: { label: "Completed", icon: CheckCircle2, tone: "text-success" },
} as const;

export function CampaignProgress({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useGetOrgTrainingDetail(campaignId, {
    query: { enabled: open },
  });

  const members = data?.members ?? [];
  const completed = members.filter((m) => m.status === "completed").length;

  return (
    <div className="pl-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 -ml-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 mr-1" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 mr-1" />
        )}
        {open && data ? `${completed} of ${members.length} completed` : "Who has completed it?"}
      </Button>

      {open && (
        <div className="mt-2 rounded-lg border overflow-hidden">
          {isLoading ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Nobody is assigned to this campaign.
            </p>
          ) : (
            <>
              {members.length > 1 && (
                <div className="border-b bg-muted/40 px-4 py-2">
                  <Progress
                    value={(completed / members.length) * 100}
                    className="h-1.5"
                    aria-label={`${completed} of ${members.length} completed`}
                  />
                </div>
              )}
              <ul className="divide-y">
                {members.map((m) => {
                  const status = STATUS[m.status as keyof typeof STATUS] ?? STATUS.assigned;
                  const Icon = status.icon;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${status.tone}`} aria-hidden="true" />
                      <span className="font-semibold truncate">{m.name}</span>
                      {m.department && (
                        <span className="text-muted-foreground truncate">{m.department}</span>
                      )}
                      <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                        {data && data.requiredScenarios > 0
                          ? `${m.completedScenarios}/${data.requiredScenarios}`
                          : `${m.completedScenarios}`}
                      </span>
                      <span className={`shrink-0 font-semibold ${status.tone}`}>{status.label}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
