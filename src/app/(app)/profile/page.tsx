"use client";
import { useGetAnalytics } from "@/api-client";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import {
	Target,
	Activity,
	CheckCircle2,
	TrendingUp,
	AlertTriangle,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader, PageShell } from "@/components/page-shell";
import { EmptyState, ErrorState, PageHeaderSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilePage() {
	const { data: analytics, isLoading, isError, refetch } = useGetAnalytics();

	if (isLoading) {
		return (
			<PageShell>
				<PageHeaderSkeleton />
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<Skeleton className="h-40 md:col-span-2" />
					<Skeleton className="h-40" />
				</div>
				<div className="grid md:grid-cols-2 gap-6">
					<Skeleton className="h-72" />
					<Skeleton className="h-72" />
				</div>
			</PageShell>
		);
	}

	if (isError || !analytics) {
		return (
			<PageShell>
				<ErrorState
					title="Couldn't load your analytics"
					description="Your performance history didn't come back from the server."
					onRetry={() => refetch()}
				/>
			</PageShell>
		);
	}

	const {
		cueAccuracy,
		vectorAccuracy,
		calibrationScore,
		progressOverTime,
		totalAttempts,
	} = analytics;

	// Format chart data
	const chartData = progressOverTime.map((p) => ({
		date: new Date(p.date).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		}),
		accuracy: p.accuracyRate,
		attempts: p.attempts,
	}));

	const sortedCues = [...cueAccuracy].sort((a, b) => b.rate - a.rate);

	return (
		<PageShell>
			{/* This page had no <h1> at all -- its largest text was the calibration
			    figure inside a card, so the heading order started at <h2>. */}
			<PageHeader
				icon={Activity}
				title="Your performance"
				description="How your detection accuracy and judgment have tracked over time."
			/>

			{/* Header overview */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card className="border shadow-none md:col-span-2">
					<CardContent className="pt-6 flex items-center justify-between">
						<div className="space-y-2">
							<p className="text-muted-foreground font-semibold uppercase tracking-wider text-xs flex items-center gap-2">
								<Target className="w-4 h-4" /> Calibration Score
							</p>
							<h2 className="text-4xl font-display font-bold">
								{calibrationScore}
								<span className="text-xl text-muted-foreground">/100</span>
							</h2>
							<p className="text-sm text-muted-foreground font-medium max-w-sm">
								Measures how well your confidence matches your actual
								accuracy. A higher score means better-calibrated judgment.
							</p>
						</div>
						{/* Fill dial. The label is rendered twice -- once in primary over the
						    empty part, once in primary-foreground clipped to the fill -- so the
						    number keeps contrast wherever the water line lands. The clipped
						    copy is h-20 (the 96px circle minus its 8px border on each side)
						    so both copies sit at the same optical centre. */}
						<div className="w-24 h-24 rounded-full border-8 border-primary/25 relative overflow-hidden shrink-0 bg-primary/5">
							<span className="absolute inset-0 flex items-center justify-center font-bold text-primary text-lg">
								{calibrationScore}%
							</span>
							<div
								className="absolute inset-x-0 bottom-0 overflow-hidden transition-all duration-1000"
								style={{ height: `${calibrationScore}%` }}
							>
								<div className="absolute inset-0 bg-primary" />
								<span className="absolute inset-x-0 bottom-0 h-20 flex items-center justify-center font-bold text-primary-foreground text-lg">
									{calibrationScore}%
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="border shadow-none">
					<CardContent className="pt-6 flex flex-col justify-center h-full">
						<p className="text-muted-foreground font-semibold uppercase tracking-wider text-xs flex items-center gap-2 mb-2">
							<Activity className="w-4 h-4" /> Practice Volume
						</p>
						<h2 className="text-4xl font-display font-bold">{totalAttempts}</h2>
						<p className="text-sm text-muted-foreground font-medium mt-1">
							Total scenarios completed
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid md:grid-cols-2 gap-6">
				{/* Progress Chart */}
				<Card className="border shadow-sm">
					<CardHeader variant="band">
						<CardTitle className="text-lg flex items-center gap-2">
							<TrendingUp className="w-5 h-5 text-primary" />
							Accuracy Over Time
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="h-62.5 w-full">
							{chartData.length > 0 ? (
								<ResponsiveContainer width="100%" height="100%">
									<LineChart
										data={chartData}
										margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
									>
										<CartesianGrid
											strokeDasharray="3 3"
											vertical={false}
											stroke="hsl(var(--border))"
										/>
										<XAxis
											dataKey="date"
											axisLine={false}
											tickLine={false}
											tick={{
												fill: "hsl(var(--muted-foreground))",
												fontSize: 12,
											}}
											dy={10}
										/>
										<YAxis
											domain={[0, 100]}
											axisLine={false}
											tickLine={false}
											tick={{
												fill: "hsl(var(--muted-foreground))",
												fontSize: 12,
											}}
											tickFormatter={(v) => `${v}%`}
										/>
										<Tooltip
											contentStyle={{
												borderRadius: "8px",
												border: "1px solid hsl(var(--border))",
												boxShadow: "var(--shadow-md)",
												backgroundColor: "hsl(var(--popover))",
												color: "hsl(var(--popover-foreground))",
											}}
											itemStyle={{
												fontWeight: 600,
												color: "hsl(var(--popover-foreground))",
											}}
											formatter={(value: number) => [`${value}%`, "Accuracy"]}
										/>
										<Line
											type="monotone"
											dataKey="accuracy"
											stroke="hsl(var(--primary))"
											strokeWidth={4}
											dot={{
												r: 4,
												strokeWidth: 2,
												fill: "hsl(var(--background))",
											}}
											activeDot={{ r: 6, strokeWidth: 0 }}
										/>
									</LineChart>
								</ResponsiveContainer>
							) : (
								<EmptyState
									className="h-full border-0"
									icon={TrendingUp}
									title="Not enough data yet"
									description="Your accuracy trend appears once you've practised on more than one day."
								/>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Vector Breakdown */}
				<Card className="border shadow-sm">
					<CardHeader variant="band">
						<CardTitle className="text-lg flex items-center gap-2">
							<AlertTriangle className="w-5 h-5 text-warning" />
							Performance by Vector
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-5 h-full">
							{vectorAccuracy.length > 0 ? (
								vectorAccuracy.map((vector) => (
									<div key={vector.vector} className="space-y-2">
										<div className="flex justify-between text-sm">
											<span className="font-bold capitalize">
												{vector.vector}
											</span>
											<span className="text-muted-foreground font-medium">
												{vector.rate}% ({vector.attempts} attempts)
											</span>
										</div>
										<Progress
											value={vector.rate}
											className={`h-2.5 ${vector.rate > 80 ? "[&>div]:bg-success" : vector.rate > 50 ? "[&>div]:bg-warning" : "[&>div]:bg-destructive"}`}
										/>
									</div>
								))
							) : (
								<EmptyState
									className="h-62.5 w-full border-0"
									icon={AlertTriangle}
									title="No channel data yet"
									description="Once you've tried email, text and voice scenarios, your per-channel accuracy shows here."
								/>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Cue Breakdown Grid */}
			<Card className="border shadow-sm">
				<CardHeader variant="band">
					<CardTitle className="text-lg flex items-center gap-2">
						<CheckCircle2 className="w-5 h-5 text-success" />
						Detailed Cue Recognition
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						How well you spot specific red flags.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{sortedCues.length > 0 ? (
							sortedCues.map((cue) => (
								<div
									key={cue.cueId}
									className="p-4 rounded-lg bg-muted/70 border border-border/70 hover:border-border transition-colors"
								>
									<div className="flex justify-between items-start mb-3">
										<span className="font-semibold text-sm leading-tight">
											{cue.label}
										</span>
										<span
											className={`text-xs font-bold px-2 py-1 rounded-full border ${
												cue.rate >= 80
													? "bg-success/10 text-success border-success/30"
													: cue.rate >= 50
														? "bg-warning/10 text-warning border-warning/30"
														: "bg-destructive/10 text-destructive border-destructive/30"
											}`}
										>
											{cue.rate}%
										</span>
									</div>
									<Progress
										value={cue.rate}
										className={`h-1.5 ${
											cue.rate >= 80
												? "[&>div]:bg-success"
												: cue.rate >= 50
													? "[&>div]:bg-warning"
													: "[&>div]:bg-destructive"
										}`}
									/>
									<p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-3">
										{cue.attempts} ATTEMPTS
									</p>
								</div>
							))
						) : (
							<EmptyState
								className="col-span-full border-0"
								icon={CheckCircle2}
								title="No cue data yet"
								description="Complete a few scenarios and you'll see which red flags you reliably catch."
							/>
						)}
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
