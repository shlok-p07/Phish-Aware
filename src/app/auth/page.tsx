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
	Building2,
	AlertTriangle,
	X,
} from "lucide-react";
import {
	useLogin,
	useSignup,
	useContinueAsGuest,
	useGetCurrentUser,
	useDiscoverSso,
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
import {
	PasswordStrength,
	MIN_PASSWORD_SCORE,
} from "@/components/password-strength";
import { ssoErrorMessage } from "@/lib/sso-errors";
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog";

const loginSchema = z.object({
	email: z.string().email("Please enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.string().email("Please enter a valid email"),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.refine((pw) => zxcvbn(pw).score >= MIN_PASSWORD_SCORE, {
			message: "Password is too weak, try adding more words or symbols",
		}),
});

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
	const discoverSso = useDiscoverSso();

	const [ssoError, setSsoError] = useState<string | null>(null);
	const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
	// Identifier-first sign-in: ask for the email, look up whether its domain
	// has an identity provider, and only fall back to a password field when it
	// doesn't. Saves SSO users from ever seeing a password box they can't use
	// (their accounts have no password hash at all).
	const [loginStep, setLoginStep] = useState<"email" | "password">("email");
	const passwordRef = useRef<HTMLInputElement>(null);
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

	// The OIDC callback redirects here with ?sso_error=<code> on any failure.
	// Rendered as a persistent inline banner rather than a toast: the user has
	// just been bounced back from an external identity provider, so they're
	// looking at this card, not at a corner notification that they may well
	// have scrolled past or dismissed by clicking.
	//
	// The copy is looked up client-side, so nothing from the URL is ever
	// rendered -- an unknown code falls back to a generic message.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get("sso_error");
		if (!code) return;
		setSsoError(ssoErrorMessage(code));
		params.delete("sso_error");
		const query = params.toString();
		router.replace(query ? `/auth?${query}` : "/auth");
	}, [router]);

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

	// Move focus to the password box when it appears, so the flow stays
	// keyboard-only from start to finish.
	useEffect(() => {
		if (loginStep === "password") passwordRef.current?.focus();
	}, [loginStep]);

	const goToPasswordStep = () => setLoginStep("password");

	const onContinue = async () => {
		if (!(await loginForm.trigger("email"))) return;
		const email = loginForm.getValues("email");
		discoverSso.mutate(
			{ data: { email } },
			{
				onSuccess: (result) => {
					if (result.ssoAvailable && result.startUrl) {
						// A full navigation, not a fetch — the next hop is the IdP,
						// which is cross-origin.
						window.location.href = result.startUrl;
						return;
					}
					goToPasswordStep();
				},
				// Discovery is a convenience, not a gate. If the lookup fails we
				// still let them sign in with a password rather than dead-ending.
				onError: goToPasswordStep,
			},
		);
	};

	const onLogin = (values: z.infer<typeof loginSchema>) => {
		loginMutation.mutate(
			{ data: values },
			{
				onSuccess: (user) => {
					queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
					queryClient.invalidateQueries({
						queryKey: getGetCurrentUserQueryKey(),
					});
					toast({ title: "Signed in" });
					router.replace("/dashboard");
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
				onSuccess: (user) => {
					queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
					queryClient.invalidateQueries({
						queryKey: getGetCurrentUserQueryKey(),
					});
					toast({
						title: "Account created",
						description: "Welcome to PhishAware.",
					});
					router.replace("/dashboard");
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
			onSuccess: (guest) => {
				queryClient.setQueryData(getGetCurrentUserQueryKey(), guest);
				queryClient.invalidateQueries({
					queryKey: getGetCurrentUserQueryKey(),
				});
				toast({
					title: "Guest session started",
					description: "Your progress is saved temporarily for this session.",
				});
				// Guests aren't redirected by the effect above (it deliberately keeps
				// real guests on /auth so they can convert), so send them in here.
				router.push(guest?.onboardingCompleted ? "/dashboard" : "/onboarding");
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
					<div className="bg-primary text-primary-foreground p-4 rounded-lg shadow-md">
						<Shield className="w-10 h-10" />
					</div>
					<div className="space-y-2">
						<h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
							PhishAware
						</h1>
						<p className="text-muted-foreground font-medium text-lg">
							{isGuest
								? "Create an account to save your guest progress before it expires."
								: "Sharpen your instincts against phishing."}
						</p>
					</div>
				</div>

				{ssoError && (
					<div
						role="alert"
						className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
					>
						<AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
						<div className="min-w-0 flex-1 space-y-0.5">
							<p className="font-semibold text-sm text-foreground">
								Single sign-on failed
							</p>
							<p className="text-sm text-muted-foreground">{ssoError}</p>
						</div>
						<button
							type="button"
							onClick={() => setSsoError(null)}
							aria-label="Dismiss"
							className="text-muted-foreground hover:text-foreground p-0.5 rounded shrink-0"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				)}

				<Card className="border shadow-sm">
					<Tabs value={tab} onValueChange={setTab} className="w-full">
						<CardHeader className="pb-4">
							<TabsList className="grid w-full grid-cols-2 p-1 bg-muted rounded-lg h-auto">
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
								onSubmit={
									loginStep === "email"
										? (e) => {
											e.preventDefault();
											void onContinue();
										}
										: loginForm.handleSubmit(onLogin)
								}
								aria-label="Log in"
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
											<div className="relative">
												<Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground pointer-events-none" />
												<FormControl>
													<Input
														type="email"
														autoComplete="username"
														placeholder="you@example.com"
														className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
														{...field}
														onChange={(e) => {
															field.onChange(e);
															// Editing the address invalidates the lookup we
															// already ran for the previous one.
															if (loginStep === "password") {
																setLoginStep("email");
																loginForm.setValue("password", "");
															}
														}}
													/>
												</FormControl>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Kept mounted but hidden so password managers still see a
								    username + password pair and can offer to autofill. */}
								<div className={cn(loginStep === "password" ? "block" : "hidden")}>
									<FormField
										control={loginForm.control}
										name="password"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="font-semibold text-foreground">
													Password
												</FormLabel>
												<div className="relative">
													<Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground pointer-events-none" />
													<FormControl>
														<Input
															type="password"
															autoComplete="current-password"
															placeholder="••••••••"
															className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
															{...field}
															ref={(el) => {
																field.ref(el);
																passwordRef.current = el;
															}}
														/>
													</FormControl>
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
									<div className="text-right">
										<button
											type="button"
											onClick={() => setForgotPasswordOpen(true)}
											className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
										>
											Forgot your password?
										</button>
									</div>
								</div>

								<Button
									type="submit"
									className="w-full py-5 text-base rounded-lg font-bold mt-2 shadow-sm hover:cursor-pointer"
									disabled={loginMutation.isPending || discoverSso.isPending}
								>
									{loginStep === "email"
										? discoverSso.isPending
											? "Checking..."
											: "Continue"
										: loginMutation.isPending
											? "Logging in..."
											: "Log in"}
								</Button>

								{loginStep === "email" && (
									// Escape hatch: someone whose domain has SSO but who also has
									// a password (an admin who set the org up beforehand) would
									// otherwise be redirected every time with no way back.
									<button
										type="button"
										onClick={goToPasswordStep}
										className="w-full text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
									>
										Use a password instead
									</button>
								)}
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
												aria-label="Sign up"
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
																		className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
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
																		className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
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
																			#1 way attackers hijack accounts,
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
																		className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
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
													className="w-full py-6 text-lg rounded-lg font-bold mt-2 shadow-sm hover:cursor-pointer"
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
								<span className="w-full border-t border-border" />
							</div>
							<div className="relative flex justify-center text-xs uppercase font-semibold tracking-wider">
								<span className="bg-muted/30 px-4 text-muted-foreground">
									Or just try it out
								</span>
							</div>
						</div>

						<Button
							variant="outline"
							size="lg"
							className="w-full py-6 rounded-lg border hover:bg-muted font-bold text-base hover:cursor-pointer"
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
			<ForgotPasswordDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen} />
		</div>
	);
}
