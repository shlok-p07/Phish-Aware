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
	BarChart,
	Bar,
	Cell,
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

export default function ProfilePage() {
	const { data: analytics, isLoading, isError } = useGetAnalytics();

	if (isLoading) {
		return (
			<div className="space-y-6 max-w-5xl mx-auto animate-pulse">
				<div className="h-32 bg-muted rounded-3xl" />
				<div className="grid md:grid-cols-2 gap-6">
					<div className="h-64 bg-muted rounded-2xl" />
					<div className="h-64 bg-muted rounded-2xl" />
				</div>
			</div>
		);
	}

	if (isError || !analytics) {
		return (
			<Card className="max-w-5xl mx-auto border-2 border-destructive/20 bg-destructive/5">
				<CardContent className="pt-6">
					<p className="text-destructive font-medium text-center">
						Failed to load analytics.
					</p>
				</CardContent>
			</Card>
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
		<div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
			{/* Header overview */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card className="border-2 shadow-none border-b-4 md:col-span-2">
					<CardContent className="pt-6 flex items-center justify-between">
						<div className="space-y-2">
							<p className="text-muted-foreground font-bold uppercase tracking-wider text-xs flex items-center gap-2">
								<Target className="w-4 h-4" /> Calibration Score
							</p>
							<h2 className="text-4xl font-display font-bold">
								{calibrationScore}
								<span className="text-xl text-muted-foreground">/100</span>
							</h2>
							<p className="text-sm text-muted-foreground font-medium max-w-sm">
								This shows how well your confidence matches your actual
								accuracy. A high score means you know exactly when you're right!
							</p>
						</div>
						<div className="w-24 h-24 rounded-full border-8 border-primary/20 flex items-center justify-center relative overflow-hidden shrink-0">
							<div
								className="absolute bottom-0 w-full bg-primary transition-all duration-1000"
								style={{ height: `${calibrationScore}%` }}
							/>
							<span className="relative z-10 font-bold text-foreground mix-blend-difference text-lg">
								{calibrationScore}%
							</span>
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 shadow-none border-b-4">
					<CardContent className="pt-6 flex flex-col justify-center h-full">
						<p className="text-muted-foreground font-bold uppercase tracking-wider text-xs flex items-center gap-2 mb-2">
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
				<Card className="border-2 shadow-sm">
					<CardHeader className="bg-muted/30 border-b-2 pb-4">
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
											stroke="var(--border)"
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
												borderRadius: "12px",
												border: "2px solid hsl(var(--border))",
												boxShadow: "none",
											}}
											itemStyle={{ fontWeight: "bold" }}
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
								<div className="h-full flex items-center justify-center text-muted-foreground font-medium">
									Not enough data yet. Keep practicing!
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Vector Breakdown */}
				<Card className="border-2 shadow-sm">
					<CardHeader className="bg-muted/30 border-b-2 pb-4">
						<CardTitle className="text-lg flex items-center gap-2">
							<AlertTriangle className="w-5 h-5 text-secondary" />
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
											className={`h-2.5 ${vector.rate > 80 ? "[&>div]:bg-success" : vector.rate > 50 ? "[&>div]:bg-secondary" : "[&>div]:bg-destructive"}`}
										/>
									</div>
								))
							) : (
								<div className="h-62.5 w-full flex items-center justify-center text-center text-muted-foreground font-medium">
									No vector data available.
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Cue Breakdown Grid */}
			<Card className="border-2 shadow-sm">
				<CardHeader className="bg-muted/30 border-b-2 pb-4">
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
									className="p-4 rounded-2xl bg-muted/30 border-2 border-transparent hover:border-border transition-colors"
								>
									<div className="flex justify-between items-start mb-3">
										<span className="font-bold text-sm leading-tight">
											{cue.label}
										</span>
										<span
											className={`text-xs font-bold px-2 py-1 rounded-full ${
												cue.rate >= 80
													? "bg-success/20 text-success-foreground"
													: cue.rate >= 50
														? "bg-secondary/20 text-secondary-foreground"
														: "bg-destructive/20 text-destructive-foreground"
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
													? "[&>div]:bg-secondary"
													: "[&>div]:bg-destructive"
										}`}
									/>
									<p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-3">
										{cue.attempts} ATTEMPTS
									</p>
								</div>
							))
						) : (
							<div className="col-span-full text-center text-muted-foreground font-medium py-10">
								Complete more scenarios to see your cue recognition.
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
