"use client";
import { useGetCurrentUser, useGetDashboard, useListMyTraining } from "@/api-client";
import { NotificationBanner } from "@/components/notification-banner";
import { RetentionCard } from "@/components/retention-card";
import { OrgLogo } from "@/components/org-brand";
import { Target as TargetIcon, CalendarCheck, ChevronRight, ShieldCheck, ShieldAlert, Award, Star } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader, PageShell } from "@/components/page-shell";
import { EmptyState, ErrorState, PageHeaderSkeleton, StatGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: summary, isLoading, isError, refetch } = useGetDashboard();
  const { data: training = [] } = useListMyTraining();
  const { data: me } = useGetCurrentUser();
  const workspace = me?.workspace ?? null;

  if (isLoading) {
    return (
      <PageShell>
        <PageHeaderSkeleton actions />
        <StatGridSkeleton count={4} />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </PageShell>
    );
  }

  if (isError || !summary) {
    return (
      <PageShell>
        <ErrorState
          title="Couldn't load your dashboard"
          description="Your training summary didn't come back from the server."
          onRetry={() => refetch()}
        />
      </PageShell>
    );
  }

  const progressPercent = summary.xpToNextLevel === 0 ? 100 : Math.round((summary.xpIntoLevel / (summary.xpIntoLevel + summary.xpToNextLevel)) * 100);

  return (
		<PageShell className="md:flex md:flex-col md:min-h-full">
			<PageHeader
				title="Overview"
				description={`${summary.name.split(" ")[0]} · Level ${summary.level}`}
				actions={
					<>
						{/* The progress meter is supporting detail, not the action --
						    on narrow screens it drops so the CTA keeps the row. */}
						<div className="hidden sm:block min-w-56">
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
					</>
				}
			/>

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

			<NotificationBanner />

			{/* A note from the customer's own security team. Nothing generic here --
			    it renders only when an admin has written something. */}
			{workspace?.branding?.welcomeMessage && (
				<div className="flex items-start gap-3 rounded-lg border bg-card p-4 shadow-sm">
					<OrgLogo
						logoUrl={workspace.branding.logoUrl}
						orgName={workspace.orgName}
						className="mt-0.5 h-8 w-8 shrink-0"
					/>
					<div className="min-w-0">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{workspace.orgName ? `From ${workspace.orgName}` : "From your security team"}
						</p>
						{/* Plain text, escaped by React. Never HTML -- see orgBranding.ts. */}
						<p className="pa-measure mt-1 text-sm leading-relaxed">
							{workspace.branding.welcomeMessage}
						</p>
					</div>
				</div>
			)}

			{/* What they have banked and what is coming back up -- the one number on
			    this page that changes between sessions, and the only one that says
			    what to do next. */}
			<RetentionCard retention={summary.retention} />

			{/* Assigned training. Campaigns were being created and never surfaced to
			    the people they were assigned to, so a mandatory module was invisible to
			    everyone except the admin who set it. */}
			{training.length > 0 && (
				<Card className="shadow-sm">
					<CardHeader variant="band">
						<CardTitle className="text-lg flex items-center gap-2">
							<CalendarCheck className="w-5 h-5 text-primary" />
							Assigned to you
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-4 space-y-3">
						{training.map((item) => (
							<div key={item.id} className="rounded-lg border p-3 space-y-2">
								<div className="flex items-start justify-between gap-3">
									<p className="font-semibold leading-tight">{item.title}</p>
									<span
										className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
											item.status === "overdue"
												? "bg-destructive/10 text-destructive"
												: item.status === "completed"
													? "bg-success/10 text-success"
													: "bg-muted text-muted-foreground"
										}`}
									>
										{item.status === "in_progress" ? "In progress" : item.status}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
									<span>
										{item.requiredScenarios > 0
											? `${item.completedScenarios} of ${item.requiredScenarios} scenarios`
											: "No scenario requirement"}
									</span>
									{/* What counts toward it, so nobody practises the wrong thing for a
									    week and wonders why the bar has not moved. */}
									<span className="text-muted-foreground">{item.focusLabel}</span>
									{item.dueDate && <span>Due {item.dueDate}</span>}
								</div>
								{item.requiredScenarios > 0 && (
									<Progress
										value={(item.completedScenarios / item.requiredScenarios) * 100}
										className="h-1.5"
									/>
								)}
								<Button asChild size="sm" variant="outline" className="rounded-lg font-semibold">
									<Link href="/practice">
										Practice now <ChevronRight className="w-4 h-4 ml-1" />
									</Link>
								</Button>
							</div>
						))}
					</CardContent>
				</Card>
			)}


			<div className="grid md:grid-cols-2 gap-6 md:flex-1">
				{/* Taxonomy strengths/focus areas from the adaptive rules engine */}
				<Card className="shadow-sm flex flex-col">
					<CardHeader variant="band">
						<CardTitle className="text-lg flex items-center gap-2">
							<Star className="w-5 h-5 text-primary" />
							Strengths
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-4 flex-1 flex flex-col">
						{summary.strengths.length > 0 ? (
							<div className="space-y-2">
								{summary.strengths.map((area) => (
									<div
										key={`${area.category}:${area.id}`}
										className="flex items-center gap-3 p-2 rounded-lg bg-success/10 border border-success/20 text-success"
									>
										<ShieldCheck className="w-5 h-5" />
										<div className="min-w-0">
											<p className="font-semibold text-sm">{area.label}</p>
											<p className="text-xs opacity-80">{area.category === "attack_type" ? "Attack type" : "Persuasion tactic"} · {area.accuracyRate}% across {area.attempts}</p>
										</div>
									</div>
								))}
							</div>
						) : (
							<EmptyState
								className="flex-1 border-0"
								icon={Star}
								title="No strengths yet"
								description="Finish a few more scenarios and the cues you reliably catch will show up here."
								action={
									<Button asChild variant="outline" size="sm" className="font-semibold">
										<Link href="/practice">Start practice</Link>
									</Button>
								}
							/>
						)}
					</CardContent>
				</Card>

				<Card className="shadow-sm flex flex-col">
					<CardHeader variant="band">
						<CardTitle className="text-lg flex items-center gap-2">
							<ShieldAlert className="w-5 h-5 text-destructive" />
							Focus Areas
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-4 flex-1 flex flex-col">
						{summary.focusAreas.length > 0 ? (
							<div className="space-y-2">
								{summary.focusAreas.map((area) => (
									<div
										key={`${area.category}:${area.id}`}
										className="flex items-center gap-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive"
									>
										<ShieldAlert className="w-5 h-5" />
										<div className="min-w-0">
											<p className="font-semibold text-sm">{area.label}</p>
											<p className="text-xs opacity-80">{area.category === "attack_type" ? "Attack type" : "Persuasion tactic"} · {area.accuracyRate}% across {area.attempts}</p>
										</div>
									</div>
								))}
							</div>
						) : (
							<EmptyState
								className="flex-1 border-0"
								icon={ShieldCheck}
								title="Nothing to work on"
								description="No cue is coming back as a consistent weak spot right now."
							/>
						)}
					</CardContent>
				</Card>
			</div>
		</PageShell>
	);
}
