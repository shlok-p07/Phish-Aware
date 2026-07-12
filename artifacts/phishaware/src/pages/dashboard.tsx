import { useGetDashboard } from "@workspace/api-client-react";
import { Trophy, Target, Flame, ChevronRight, ShieldCheck, ShieldAlert, Award, Star } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-muted rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <Card className="border-2 border-destructive/20 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-destructive font-medium text-center">Failed to load dashboard. Try refreshing.</p>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = summary.xpToNextLevel === 0 ? 100 : Math.round((summary.xpIntoLevel / (summary.xpIntoLevel + summary.xpToNextLevel)) * 100);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Header */}
      <div className="bg-primary text-primary-foreground rounded-3xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        {/* Decor */}
        <div className="absolute -right-12 -top-12 opacity-10">
          <ShieldCheck className="w-64 h-64" />
        </div>
        
        <div className="space-y-2 text-center md:text-left relative z-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold">Welcome back, {summary.name.split(' ')[0]}!</h1>
          <p className="text-primary-foreground/80 font-medium text-lg">You're getting sharper every day.</p>
        </div>
        
        <div className="w-full md:w-64 bg-primary-foreground/10 rounded-2xl p-4 backdrop-blur-sm relative z-10">
          <div className="flex justify-between items-end mb-2">
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-wider text-primary-foreground/70">Level {summary.level}</p>
              <p className="text-2xl font-bold">{summary.xp} XP</p>
            </div>
            {summary.xpToNextLevel > 0 && (
              <p className="text-xs font-medium text-primary-foreground/80 mb-1">{summary.xpToNextLevel} to next</p>
            )}
          </div>
          <Progress value={progressPercent} className="h-3 bg-primary-foreground/20 [&>div]:bg-white" />
        </div>
      </div>

      {/* Primary Action */}
      <Link href="/practice">
        <div className="group block bg-card border-2 border-border hover:border-primary rounded-3xl p-2 transition-all hover:shadow-md cursor-pointer">
          <div className="bg-muted/30 rounded-2xl p-6 flex items-center justify-between group-hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-5">
              <div className="bg-primary p-4 rounded-xl shadow-sm text-primary-foreground group-hover:scale-110 transition-transform">
                <Target className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold text-foreground">Practice now</h2>
                <p className="text-muted-foreground font-medium">Review your next scenario and earn XP</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-full bg-background border-2 border-border group-hover:border-primary group-hover:text-primary transition-colors">
              <ChevronRight className="w-6 h-6" />
            </div>
          </div>
        </div>
      </Link>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-2 shadow-none border-b-4">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <Flame className={`w-8 h-8 mb-2 ${summary.streak > 0 ? "text-orange-500" : "text-muted-foreground/30"}`} />
            <p className="text-2xl font-bold">{summary.streak}</p>
            <p className="text-sm text-muted-foreground font-medium">Day Streak</p>
          </CardContent>
        </Card>
        
        <Card className="border-2 shadow-none border-b-4">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <Trophy className="w-8 h-8 mb-2 text-yellow-500" />
            <p className="text-2xl font-bold">{summary.accuracyRate}%</p>
            <p className="text-sm text-muted-foreground font-medium">Accuracy</p>
          </CardContent>
        </Card>

        <Card className="border-2 shadow-none border-b-4">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <ShieldCheck className="w-8 h-8 mb-2 text-success" />
            <p className="text-2xl font-bold">{summary.totalAttempts}</p>
            <p className="text-sm text-muted-foreground font-medium">Scenarios</p>
          </CardContent>
        </Card>

        <Card className="border-2 shadow-none border-b-4">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <Award className="w-8 h-8 mb-2 text-primary" />
            <p className="text-2xl font-bold">{summary.badges.length}</p>
            <p className="text-sm text-muted-foreground font-medium">Badges</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Strong/Weak Cues */}
        <Card className="border-2 shadow-sm">
          <CardHeader className="bg-muted/30 border-b-2 border-border pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-primary" />
              Your Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {summary.strongCues.length > 0 ? (
              summary.strongCues.map((cue) => (
                <div key={cue.id} className="flex items-center gap-3 p-2 rounded-lg bg-success/10 border border-success/20 text-success-foreground">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-semibold text-sm">{cue.label}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground p-2">Play more scenarios to discover your strengths.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 shadow-sm">
          <CardHeader className="bg-muted/30 border-b-2 border-border pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Focus Areas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {summary.weakCues.length > 0 ? (
              summary.weakCues.map((cue) => (
                <div key={cue.id} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive-foreground">
                  <ShieldAlert className="w-5 h-5" />
                  <span className="font-semibold text-sm">{cue.label}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground p-2">You don't have any major blind spots right now. Great job!</p>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}