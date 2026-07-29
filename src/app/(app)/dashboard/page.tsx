"use client";
import { useGetDashboard } from "@/api-client";
import { Target as TargetIcon, CalendarCheck, ChevronRight, ShieldCheck, ShieldAlert, Award, Star } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function DashboardPage() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-muted rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <Card className="border border-destructive/20 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-destructive font-medium text-center">Failed to load dashboard. Try refreshing.</p>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = summary.xpToNextLevel === 0 ? 100 : Math.round((summary.xpIntoLevel / (summary.xpIntoLevel + summary.xpToNextLevel)) * 100);

  return (
		<div className="space-y-6 animate-in fade-in duration-300 md:flex md:flex-col md:min-h-full">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-border">
				<div className="space-y-1">
					<h1 className="text-2xl font-display font-bold">Overview</h1>
					<p className="text-sm text-muted-foreground font-medium">
						{summary.name.split(" ")[0]} · Level {summary.level}
					</p>
				</div>
				<div className="flex items-center gap-4">
					<div className="min-w-56">
						<div className="flex items-center justify-between gap-3 text-xs mb-1.5">
							<span className="font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
								Training progress
							</span>
							{summary.xpToNextLevel > 0 && (
								<span className="text-muted-foreground font-medium whitespace-nowrap">
									{summary.xpToNextLevel.toLocaleString()} pts to next level
								</span>
							)}
						</div>
						<Progress value={progressPercent} className="h-2" />
					</div>
					<Button asChild className="rounded-md font-semibold shrink-0">
						<Link href="/practice">
							Start practice
							<ChevronRight className="w-4 h-4 ml-1" />
						</Link>
					</Button>
				</div>
			</div>

			{/* KPI Row */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<Card className="shadow-sm">
					<CardContent className="pt-6">
						<div className="flex items-center justify-between mb-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Detection accuracy
							</p>
							<TargetIcon className="w-4 h-4 text-muted-foreground/50" />
						</div>
						<p className="text-3xl font-bold tabular-nums">{summary.accuracyRate}%</p>
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardContent className="pt-6">
						<div className="flex items-center justify-between mb-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Scenarios completed
							</p>
							<ShieldCheck className="w-4 h-4 text-muted-foreground/50" />
						</div>
						<p className="text-3xl font-bold tabular-nums">{summary.totalAttempts}</p>
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardContent className="pt-6">
						<div className="flex items-center justify-between mb-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Active streak
							</p>
							<CalendarCheck className={`w-4 h-4 ${summary.streak > 0 ? "text-primary" : "text-muted-foreground/50"}`} />
						</div>
						<p className="text-3xl font-bold tabular-nums">
							{summary.streak}
							<span className="text-base font-semibold text-muted-foreground ml-1">
								{summary.streak === 1 ? "day" : "days"}
							</span>
						</p>
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardContent className="pt-6">
						<div className="flex items-center justify-between mb-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Milestones reached
							</p>
							<Award className="w-4 h-4 text-muted-foreground/50" />
						</div>
						<p className="text-3xl font-bold tabular-nums">{summary.badges.length}</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid md:grid-cols-2 gap-6 md:flex-1">
				{/* Strong/Weak Cues */}
				<Card className="shadow-sm flex flex-col">
					<CardHeader className="bg-muted/30 border-b border-border pb-4">
						<CardTitle className="text-lg flex items-center gap-2">
							<Star className="w-5 h-5 text-primary" />
							Strengths
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-4 flex-1 flex flex-col">
						{summary.strongCues.length > 0 ? (
							<div className="space-y-2">
								{summary.strongCues.map((cue) => (
									<div
										key={cue.id}
										className="flex items-center gap-3 p-2 rounded-lg bg-success/10 border border-success/20 text-success-foreground"
									>
										<ShieldCheck className="w-5 h-5" />
										<span className="font-semibold text-sm">{cue.label}</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground text-center flex-1 flex items-center justify-center py-6">
								Complete more scenarios to surface your strengths.
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="shadow-sm flex flex-col">
					<CardHeader className="bg-muted/30 border-b border-border pb-4">
						<CardTitle className="text-lg flex items-center gap-2">
							<ShieldAlert className="w-5 h-5 text-destructive" />
							Focus Areas
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-4 flex-1 flex flex-col">
						{summary.weakCues.length > 0 ? (
							<div className="space-y-2">
								{summary.weakCues.map((cue) => (
									<div
										key={cue.id}
										className="flex items-center gap-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive-foreground"
									>
										<ShieldAlert className="w-5 h-5" />
										<span className="font-semibold text-sm">{cue.label}</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground text-center flex-1 flex items-center justify-center py-6">
								No significant weak areas detected.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}