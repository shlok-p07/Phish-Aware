"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
	Shield,
	Mail,
	Lock,
	User,
	ArrowRight,
	Ghost,
	HelpCircle,
} from "lucide-react";
import {
	useLogin,
	useSignup,
	useContinueAsGuest,
	useGetCurrentUser,
	getGetCurrentUserQueryKey,
} from "@/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import zxcvbn from "zxcvbn";

const loginSchema = z.object({
	email: z.string().email("Please enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

const MIN_PASSWORD_SCORE = 2;

const signupSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.string().email("Please enter a valid email"),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.refine((pw) => zxcvbn(pw).score >= MIN_PASSWORD_SCORE, {
			message: "Password is too weak — try adding more words or symbols",
		}),
});

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_COLORS = [
	"bg-destructive",
	"bg-destructive",
	"bg-amber-500",
	"bg-emerald-500",
	"bg-emerald-600",
] as const;

function PasswordStrength({ password }: { password: string }) {
	if (!password) return null;
	const { score, feedback } = zxcvbn(password);
	const hint = feedback.warning || feedback.suggestions[0];
	return (
		<div className="space-y-1.5 pt-1">
			<div className="flex gap-1.5">
				{[0, 1, 2, 3].map((i) => (
					<span
						key={i}
						className={cn(
							"h-1.5 flex-1 rounded-full transition-colors",
							i < score ? STRENGTH_COLORS[score] : "bg-muted",
						)}
					/>
				))}
			</div>
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"text-xs font-semibold",
						score >= MIN_PASSWORD_SCORE
							? "text-muted-foreground"
							: "text-destructive",
					)}
				>
					{STRENGTH_LABELS[score]}
				</span>
				{hint && (
					<span className="text-xs text-muted-foreground text-right">
						{hint}
					</span>
				)}
			</div>
		</div>
	);
}

export default function AuthPage() {
	const router = useRouter();
	const { toast } = useToast();
	const queryClient = useQueryClient();

	const { data: user, isLoading } = useGetCurrentUser({
		query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
	});

	const loginMutation = useLogin();
	const signupMutation = useSignup();
	const guestMutation = useContinueAsGuest();

	const [tab, setTab] = useState("login");
	const loginRef = useRef<HTMLDivElement>(null);
	const signupRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | undefined>(undefined);

	useEffect(() => {
		const measure = () => {
			const el = tab === "login" ? loginRef.current : signupRef.current;
			if (el) setHeight(el.offsetHeight);
		};
		measure();
		const ro = new ResizeObserver(measure);
		if (loginRef.current) ro.observe(loginRef.current);
		if (signupRef.current) ro.observe(signupRef.current);
		return () => ro.disconnect();
	}, [tab, isLoading, user]);

	const isGuest = Boolean(user?.isGuest);

	useEffect(() => {
		// Real (signed-up) users skip auth. Guests are allowed in so they can
		// convert their account and keep their progress.
		if (user && !user.isGuest && !isLoading) {
			router.push("/dashboard");
		}
	}, [user, isLoading, router]);

	useEffect(() => {
		if (isGuest) setTab("signup");
	}, [isGuest]);

	const loginForm = useForm<z.infer<typeof loginSchema>>({
		resolver: zodResolver(loginSchema),
		defaultValues: { email: "", password: "" },
	});

	const signupForm = useForm<z.infer<typeof signupSchema>>({
		resolver: zodResolver(signupSchema),
		mode: "onChange",
		defaultValues: { name: "", email: "", password: "" },
	});

	const signupPassword = signupForm.watch("password");

	const onLogin = (values: z.infer<typeof loginSchema>) => {
		loginMutation.mutate(
			{ data: values },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({
						queryKey: getGetCurrentUserQueryKey(),
					});
					toast({ title: "Welcome back!" });
				},
				onError: (err: any) => {
					toast({
						title: "Login failed",
						description: err?.message || "Invalid credentials",
						variant: "destructive",
					});
				},
			},
		);
	};

	const onSignup = (values: z.infer<typeof signupSchema>) => {
		signupMutation.mutate(
			{ data: values },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({
						queryKey: getGetCurrentUserQueryKey(),
					});
					toast({
						title: "Account created!",
						description: "Welcome to PhishAware.",
					});
				},
				onError: (err: any) => {
					toast({
						title: "Signup failed",
						description: err?.message || "Could not create account",
						variant: "destructive",
					});
				},
			},
		);
	};

	const onGuest = () => {
		guestMutation.mutate(undefined, {
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: getGetCurrentUserQueryKey(),
				});
				toast({
					title: "Playing as Guest",
					description: "Your progress will be saved temporarily.",
				});
			},
			onError: () => {
				toast({
					title: "Error",
					description: "Could not start guest session",
					variant: "destructive",
				});
			},
		});
	};

	if (isLoading || (user && !user.isGuest)) return null;

	return (
		<div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-muted/30">
			<div className="max-w-md w-full space-y-8">
				<div className="flex flex-col items-center text-center space-y-4">
					<div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-md">
						<Shield className="w-10 h-10" />
					</div>
					<div className="space-y-2">
						<h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
							PhishAware
						</h1>
						<p className="text-muted-foreground font-medium text-lg">
							{isGuest
								? "Create an account to save your guest progress before it expires."
								: "Build your scam-spotting instincts."}
						</p>
					</div>
				</div>

				<Card className="border-2 shadow-sm">
					<Tabs value={tab} onValueChange={setTab} className="w-full">
						<CardHeader className="pb-4">
							<TabsList className="grid w-full grid-cols-2 p-1 bg-muted rounded-xl h-auto">
								<TabsTrigger
									value="login"
									className="py-2.5 rounded-lg font-semibold text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm hover:cursor-pointer"
								>
									Log in
								</TabsTrigger>
								<TabsTrigger
									value="signup"
									className="py-2.5 rounded-lg font-semibold text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm hover:cursor-pointer"
								>
									Sign up
								</TabsTrigger>
							</TabsList>
						</CardHeader>
						<CardContent className="pb-6">
							<div
								style={{
									height: height !== undefined ? `${height}px` : undefined,
									transition: "height 300ms ease-out",
								}}
								className="relative overflow-hidden"
							>
								<div
									ref={loginRef}
									aria-hidden={tab !== "login"}
									className={cn(
										"transition-opacity duration-200",
										tab === "login"
											? "relative opacity-100"
											: "pointer-events-none absolute inset-x-0 top-0 opacity-0",
									)}
								>
										<Form {...loginForm}>
											<form
												onSubmit={loginForm.handleSubmit(onLogin)}
												className="space-y-4"
											>
												<FormField
													control={loginForm.control}
													name="email"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="font-semibold text-foreground">
																Email
															</FormLabel>
															<FormControl>
																<div className="relative">
																	<Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
																	<Input
																		placeholder="you@example.com"
																		className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
																		{...field}
																	/>
																</div>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={loginForm.control}
													name="password"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="font-semibold text-foreground">
																Password
															</FormLabel>
															<FormControl>
																<div className="relative">
																	<Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
																	<Input
																		type="password"
																		placeholder="••••••••"
																		className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
																		{...field}
																	/>
																</div>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<Button
													type="submit"
													className="w-full py-6 text-lg rounded-xl font-bold mt-2 shadow-sm hover:cursor-pointer"
													disabled={loginMutation.isPending}
												>
													{loginMutation.isPending ? "Logging in..." : "Log in"}
												</Button>
											</form>
										</Form>
								</div>

								<div
									ref={signupRef}
									aria-hidden={tab !== "signup"}
									className={cn(
										"transition-opacity duration-200",
										tab === "signup"
											? "relative opacity-100"
											: "pointer-events-none absolute inset-x-0 top-0 opacity-0",
									)}
								>
										<Form {...signupForm}>
											<form
												onSubmit={signupForm.handleSubmit(onSignup)}
												className="space-y-4"
											>
												<FormField
													control={signupForm.control}
													name="name"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="font-semibold text-foreground">
																First Name
															</FormLabel>
															<FormControl>
																<div className="relative">
																	<User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
																	<Input
																		placeholder="Alex"
																		className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
																		{...field}
																	/>
																</div>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={signupForm.control}
													name="email"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="font-semibold text-foreground">
																Email
															</FormLabel>
															<FormControl>
																<div className="relative">
																	<Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
																	<Input
																		placeholder="you@example.com"
																		className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
																		{...field}
																	/>
																</div>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={signupForm.control}
													name="password"
													render={({ field }) => (
														<FormItem>
															<div className="flex items-center gap-1.5">
																<FormLabel className="font-semibold text-foreground">
																	Password
																</FormLabel>
																<TooltipProvider delayDuration={150}>
																	<Tooltip>
																		<TooltipTrigger
																			type="button"
																			className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
																			aria-label="Why password strength matters"
																		>
																			<HelpCircle className="h-4 w-4" />
																		</TooltipTrigger>
																		<TooltipContent className="max-w-xs text-left leading-relaxed">
																			A strong, unique password is your first
																			line of defense. Weak or reused passwords
																			are cracked in seconds and are the
																			#1 way attackers hijack accounts —
																			often the first step in a phishing
																			attack. Mix length and unpredictable
																			words for the best protection.
																			<a
																				href="https://www.staysafeonline.org/articles/passwords"
																				target="_blank"
																				rel="noopener noreferrer"
																				className="mt-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
																			>
																				Learn more
																				<ArrowRight className="h-3 w-3" />
																			</a>
																		</TooltipContent>
																	</Tooltip>
																</TooltipProvider>
															</div>
															<FormControl>
																<div className="relative">
																	<Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
																	<Input
																		type="password"
																		placeholder="••••••••"
																		className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
																		{...field}
																	/>
																</div>
															</FormControl>
															<PasswordStrength password={signupPassword} />
															<FormMessage />
														</FormItem>
													)}
												/>
												<Button
													type="submit"
													className="w-full py-6 text-lg rounded-xl font-bold mt-2 shadow-sm hover:cursor-pointer"
													disabled={signupMutation.isPending}
												>
													{signupMutation.isPending
														? "Creating account..."
														: "Start learning"}
												</Button>
											</form>
										</Form>
								</div>
							</div>
						</CardContent>
					</Tabs>
				</Card>

				{!isGuest && (
					<div className="flex flex-col space-y-4">
						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<span className="w-full border-t-2 border-border" />
							</div>
							<div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
								<span className="bg-muted/30 px-4 text-muted-foreground">
									Or just try it out
								</span>
							</div>
						</div>

						<Button
							variant="outline"
							size="lg"
							className="w-full py-6 rounded-xl border-2 hover:bg-muted font-bold text-base hover:cursor-pointer"
							onClick={onGuest}
							disabled={guestMutation.isPending}
						>
							<Ghost className="mr-2 h-5 w-5" />
							Continue as Guest
							<ArrowRight className="ml-auto h-5 w-5 opacity-50" />
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
