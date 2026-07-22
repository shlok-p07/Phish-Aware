"use client";
import { useGetLeaderboard } from "@/api-client";
import { Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { initials } from "@/lib/utils";

export default function LeaderboardPage() {
  const { data: leaderboard, isLoading, isError } = useGetLeaderboard();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto animate-pulse">
        <div className="h-32 bg-muted rounded-lg" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !leaderboard) {
    return (
      <Card className="max-w-3xl mx-auto border border-destructive/20 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-destructive font-medium text-center">Failed to load team benchmark.</p>
        </CardContent>
      </Card>
    );
  }

  const total = leaderboard.length;
  const me = leaderboard.find((e) => e.isCurrentUser);
  // Percentile: share of the cohort you rank at or above. Rank 1 → 100th (top of team).
  const percentile = me ? Math.round(((total - me.rank) / Math.max(1, total - 1)) * 100) : null;
  // "Top X%" only reads correctly in the upper half; below that, plain-language standing.
  const topPct = me ? Math.max(1, Math.round((me.rank / total) * 100)) : null;
  const standingLabel =
    me && topPct !== null && me.rank <= Math.ceil(total / 2)
      ? `Top ${topPct}%`
      : "Building up";

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="pb-2 border-b border-border">
        <h1 className="text-2xl font-display font-bold">Team benchmark</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How your detection performance compares across your organization.
        </p>
      </div>

      {/* Standing summary */}
      {me && percentile !== null && (
        <Card className="border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Your standing
                </p>
                <p className="text-3xl font-display font-bold tabular-nums">
                  {standingLabel}
                  <span className="text-base font-semibold text-muted-foreground ml-2">
                    · #{me.rank} of {total} on your team
                  </span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Points
                </p>
                <p className="text-2xl font-bold tabular-nums">{me.xp.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium mb-1.5">
                <span>Team cohort</span>
                <span>{percentile}th percentile</span>
              </div>
              <Progress value={percentile} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cohort standings */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Team standings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {leaderboard.map((entry) => (
              <li
                key={entry.rank + entry.name}
                className={`flex items-center gap-4 px-4 sm:px-5 py-3 ${
                  entry.isCurrentUser ? "bg-primary/5" : ""
                }`}
              >
                <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground text-right shrink-0">
                  {entry.rank}
                </span>
                <div className="w-9 h-9 shrink-0 rounded-md bg-muted border flex items-center justify-center text-sm font-semibold text-muted-foreground">
                  {initials(entry.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold truncate ${
                      entry.isCurrentUser ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {entry.name}
                    {entry.isCurrentUser && (
                      <span className="ml-2 text-xs font-semibold text-muted-foreground">You</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{entry.level} level</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {entry.xp.toLocaleString()}
                  <span className="text-xs font-medium text-muted-foreground ml-1">pts</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
