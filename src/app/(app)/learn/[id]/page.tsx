"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
	useGetLesson,
	useCompleteLesson,
	getListLessonsQueryKey,
	getListMyTrainingQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { titleCase } from "@/lib/utils";
import { useChatbot } from "@/components/chatbot-widget";
import { PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { LessonScreenView } from "@/components/learn/lesson-screen";

export default function LessonPage() {
	const params = useParams();
	const id = params.id as string;

	const { data: lesson, isLoading, isError } = useGetLesson(id);
	const [currentStep, setCurrentStep] = useState(0);
	const queryClient = useQueryClient();
	const completeLesson = useCompleteLesson();
	// Once per visit. The endpoint is idempotent, but re-firing on every render
	// of the final screen would be a request per navigation keystroke.
	const recorded = useRef(false);
	const chat = useChatbot();

	// Computed here rather than beside the other step maths further down: hooks
	// cannot sit after the loading and error early-returns.
	const reachedSummary = lesson ? currentStep === lesson.screens.length : false;

	// Reaching the summary screen is what "finished the lesson" means. Recorded
	// here rather than behind a button, so a learner who reads it and navigates
	// away still gets credit -- and so assigned reading can actually complete,
	// which it never could when lessons recorded nothing at all.
	useEffect(() => {
		if (!reachedSummary || recorded.current) return;
		recorded.current = true;
		completeLesson.mutate(
			{ id },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: getListLessonsQueryKey() });
					queryClient.invalidateQueries({ queryKey: getListMyTrainingQueryKey() });
				},
			},
		);
	}, [reachedSummary, id, completeLesson, queryClient]);

	if (isLoading) {
		return (
			<PageShell width="5xl">
				<Skeleton className="h-10 w-2/3" />
				<Skeleton className="h-96 w-full" />
			</PageShell>
		);
	}

	if (isError || !lesson) {
		return (
			<PageShell width="5xl">
				<EmptyState
					icon={ShieldAlert}
					title="Lesson not found"
					description="That lesson doesn't exist, or it's no longer part of the library."
					action={
						<Button asChild variant="outline" className="font-semibold">
							<Link href="/learn">Back to library</Link>
						</Button>
					}
				/>
			</PageShell>
		);
	}

	if (lesson.vector !== "email" && lesson.vector !== "sms" && lesson.vector !== "voice") {
		return (
			<PageShell width="5xl">
				<EmptyState
					icon={ShieldAlert}
					title="Coming soon"
					description="This lesson is still a work in progress. Check back soon."
					action={
						<Button asChild variant="outline" className="font-semibold">
							<Link href="/learn">Back to library</Link>
						</Button>
					}
				/>
			</PageShell>
		);
	}

	// Screens + final Red Flags summary screen
	const totalSteps = lesson.screens.length + 1;
	const isLastStep = currentStep === totalSteps - 1;

	const nextStep = () =>
		setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
	const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

	// Opens the floating assistant and seeds it with a request for deeper,
	// scenario-agnostic detail on this lesson's vector -- mirrors the practice
	// page's "explain this scenario" pattern instead of just linking back to
	// the library the learner already came from.
	const askForMore = () => {
		const flags = lesson.redFlags.length > 0
			? lesson.redFlags.map((f) => titleCase(f.replaceAll("_", " "))).join(", ")
			: "the tactics described in this lesson";
		chat.askAbout(
			`I just finished the "${lesson.title}" lesson (a ${lesson.vector} phishing vector). It covered these red flags: ${flags}. Can you share more facts, real-world examples, or advanced detection tips about this type of attack beyond what the lesson covered?`,
		);
	};

	const progress = ((currentStep + 1) / totalSteps) * 100;

	return (
		<PageShell width="5xl">
			{/* Top Bar */}
			<div className="flex items-center gap-4 mb-8">
				<Button
					variant="ghost"
					size="icon"
					asChild
					className="shrink-0 rounded-full hover:bg-muted"
				>
					<Link href="/learn" aria-label="Back to the lesson library">
						<ArrowLeft className="w-5 h-5" />
					</Link>
				</Button>
				<div className="flex-1 space-y-2">
					<div className="flex justify-between gap-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{/* The lesson title is this page's heading -- it just happens to be
						    set small, since the per-screen headings carry the visual weight. */}
						<h1 className="truncate font-semibold uppercase tracking-wider">
							{lesson.title}
						</h1>
						<span className="shrink-0">
							{currentStep + 1} / {totalSteps}
						</span>
					</div>
					<Progress
						value={progress}
						className="h-2.5 bg-muted/50 [&>div]:bg-primary"
					/>
				</div>
			</div>

			{/* Main Content Area */}
			<Card className="border shadow-md overflow-hidden min-h-100 flex flex-col animate-in fade-in zoom-in-95 duration-300">
				<CardContent className="flex-1 p-6 sm:p-10 flex flex-col justify-start">
					{!isLastStep && <LessonScreenView screen={lesson.screens[currentStep]} />}

					{isLastStep && (
						<div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
							<div className="space-y-3">
								<div className="inline-flex bg-destructive/10 p-3 rounded-lg mb-2 text-destructive">
									<ShieldAlert className="w-8 h-8" />
								</div>
								<h2 className="text-3xl font-display font-bold">
									Top Red Flags
								</h2>
								<p className="pa-measure text-muted-foreground font-medium text-lg">
									Always watch out for these cues in {lesson.vector} scams.
								</p>
							</div>

							<ul className="space-y-3">
								{lesson.redFlags.map((flag, idx) => (
									<li
										key={idx}
										className="flex items-start gap-3 p-4 bg-muted/60 rounded-lg border border-transparent hover:border-border transition-colors"
									>
										<CheckCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
										<span className="font-semibold text-foreground text-lg leading-snug">
											{titleCase(flag.replaceAll("_", " "))}
										</span>
									</li>
								))}
							</ul>
						</div>
					)}
				</CardContent>

				<CardFooter className="p-6 bg-muted/50 border-t border-border flex justify-between gap-4">
					<Button
						variant="outline"
						size="lg"
						onClick={prevStep}
						disabled={currentStep === 0}
						className="rounded-lg border font-bold w-1/3 shadow-sm"
					>
						Back
					</Button>

					{isLastStep ? (
						<div className="flex flex-row gap-4 w-full items-center">
							<Button
								variant="secondary"
								size="lg"
								className="rounded-lg font-bold w-2/3 shadow-sm text-lg"
								onClick={askForMore}
							>
								<Sparkles className="w-5 h-5 mr-2" />
								Learn more
							</Button>
							<Button
								size="lg"
								className="rounded-lg font-bold w-2/3 shadow-sm text-lg"
								asChild
							>
								<Link href={`/practice?vector=${lesson.vector}`}>Put it to practice</Link>
							</Button>
						</div>
					) : (
						<Button
							size="lg"
							onClick={nextStep}
							className="rounded-lg font-bold w-2/3 shadow-sm text-lg group"
						>
							Continue
							<ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
						</Button>
					)}
				</CardFooter>
			</Card>
		</PageShell>
	);
}
