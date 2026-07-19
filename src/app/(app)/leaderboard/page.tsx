"use client";
import { useGetLeaderboard } from "@/api-client";
import { Trophy, Medal, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LeaderboardPage() {
  const { data: leaderboard, isLoading, isError } = useGetLeaderboard();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto animate-pulse">
        <div className="h-24 bg-muted rounded-3xl" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !leaderboard) {
    return (
      <Card className="max-w-3xl mx-auto border-2 border-destructive/20 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-destructive font-medium text-center">Failed to load rankings.</p>
        </CardContent>
      </Card>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-6 h-6 text-yellow-500 fill-yellow-500/20" />;
      case 2: return <Medal className="w-6 h-6 text-slate-400 fill-slate-400/20" />;
      case 3: return <Medal className="w-6 h-6 text-amber-600 fill-amber-600/20" />;
      default: return <span className="font-bold text-muted-foreground text-lg w-6 text-center">{rank}</span>;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-3">
        <div className="inline-flex bg-primary/10 p-4 rounded-full mb-2">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">Leaderboard</h1>
        <p className="text-muted-foreground text-lg font-medium">See how your scam-spotting skills stack up.</p>
      </div>

      <div className="space-y-3 mt-8">
        {leaderboard.map((entry) => (
          <Card 
            key={entry.rank + entry.name} 
            className={`border-2 shadow-sm transition-all overflow-hidden ${
              entry.isCurrentUser 
                ? "border-primary bg-primary/5 shadow-md scale-[1.02]" 
                : "border-border hover:border-primary/30"
            }`}
          >
            <div className="flex items-center p-4 sm:p-5 gap-4">
              <div className="w-10 sm:w-12 flex justify-center shrink-0">
                {getRankIcon(entry.rank)}
              </div>
              
              <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-muted border-2 flex items-center justify-center text-xl font-bold text-muted-foreground uppercase shadow-sm">
                {entry.name.substring(0, 2)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold text-lg truncate ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
                    {entry.name} {entry.isCurrentUser && "(You)"}
                  </h3>
                </div>
                <p className="text-sm font-medium text-muted-foreground capitalize">
                  {entry.level} Level
                </p>
              </div>

              <div className="shrink-0 text-right">
                <Badge variant={entry.isCurrentUser ? "default" : "secondary"} className="text-sm px-3 py-1 font-bold">
                  {entry.xp} XP
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}