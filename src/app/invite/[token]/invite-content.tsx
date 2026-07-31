"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, Lock, User, ArrowRight, Building2, MailWarning } from "lucide-react";
import zxcvbn from "zxcvbn";
import {
	useGetInvitation,
	useAcceptInvitation,
	getGetCurrentUserQueryKey,
} from "@/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
	PasswordStrength,
	MIN_PASSWORD_SCORE,
} from "@/components/password-strength";

const acceptSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.refine((pw) => zxcvbn(pw).score >= MIN_PASSWORD_SCORE, {
			message: "Password is too weak — try adding more words or symbols",
		}),
});

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-muted/30">
			<div className="max-w-md w-full space-y-8">
				<div className="flex flex-col items-center text-center space-y-4">
					<div className="bg-primary text-primary-foreground p-4 rounded-lg shadow-md">
						<Shield className="w-10 h-10" />
					</div>
					<h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
						PhishAware
					</h1>
				</div>
				{children}
			</div>
		</div>
	);
}

export function InviteContent({ token }: { token: string }) {
	const router = useRouter();
	const { toast } = useToast();
	const queryClient = useQueryClient();

	const {
		data: invitation,
		isLoading,
		error,
	} = useGetInvitation(token, { query: { retry: false } });
	const acceptMutation = useAcceptInvitation();
	const [accountExists, setAccountExists] = useState(false);

	const form = useForm<z.infer<typeof acceptSchema>>({
		resolver: zodResolver(acceptSchema),
		mode: "onChange",
		defaultValues: { name: "", password: "" },
	});
	const password = form.watch("password");

	const onAccept = (values: z.infer<typeof acceptSchema>) => {
		acceptMutation.mutate(
			{ token, data: values },
			{
				onSuccess: (user) => {
					queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
					queryClient.invalidateQueries({
						queryKey: getGetCurrentUserQueryKey(),
					});
					toast({
						title: "Welcome aboard",
						description: `You've joined ${invitation?.orgName ?? "your organization"}.`,
					});
					router.replace(user?.onboardingCompleted ? "/dashboard" : "/onboarding");
				},
				onError: (err: any) => {
					// The server refuses to set a password on an address that already
					// has an account — that person has to sign in and adopt it.
					if (err?.code === "account_exists" || err?.status === 409) {
						setAccountExists(true);
						return;
					}
					toast({
						title: "Couldn't accept the invitation",
						description: err?.message || "Please try again.",
						variant: "destructive",
					});
				},
			},
		);
	};

	if (isLoading) {
		return (
			<Shell>
				<Card className="border shadow-sm">
					<CardContent className="py-10 text-center text-muted-foreground">
						Checking your invitation…
					</CardContent>
				</Card>
			</Shell>
		);
	}

	if (error || !invitation) {
		const gone = (error as any)?.status === 410;
		return (
			<Shell>
				<Card className="border shadow-sm">
					<CardHeader className="text-center space-y-3">
						<div className="mx-auto bg-destructive/10 text-destructive p-3 rounded-full w-fit">
							<MailWarning className="h-7 w-7" />
						</div>
						<CardTitle className="text-2xl">
							{gone ? "This invitation is no longer valid" : "Invitation not found"}
						</CardTitle>
						<CardDescription className="text-base">
							{gone
								? "It may have expired, been revoked, or already been used. Ask an admin at your organization to send a new one."
								: "Double-check the link, or ask an admin at your organization to send a new invitation."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline" className="w-full py-6 rounded-lg font-semibold">
							<Link href="/auth">Go to sign in</Link>
						</Button>
					</CardContent>
				</Card>
			</Shell>
		);
	}

	const mustSignIn = invitation.requiresExistingAccount || accountExists;

	return (
		<Shell>
			<Card className="border shadow-sm">
				<CardHeader className="space-y-2">
					<CardTitle className="text-2xl">
						Join {invitation.orgName}
					</CardTitle>
					<CardDescription className="text-base">
						You were invited as{" "}
						<span className="font-semibold text-foreground">
							{invitation.email}
						</span>
						{invitation.role === "admin" ? " with admin access." : "."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{invitation.ssoAvailable && invitation.ssoStartUrl && (
						<Button
							type="button"
							className="w-full py-6 rounded-lg font-bold"
							onClick={() => {
								window.location.href = invitation.ssoStartUrl!;
							}}
						>
							<Building2 className="mr-2 h-5 w-5" />
							Continue with your company account
						</Button>
					)}

					{mustSignIn ? (
						<div className="space-y-4">
							{invitation.ssoAvailable && (
								<div className="relative">
									<div className="absolute inset-0 flex items-center">
										<span className="w-full border-t border-border" />
									</div>
									<div className="relative flex justify-center text-xs uppercase font-semibold tracking-wider">
										<span className="bg-card px-4 text-muted-foreground">Or</span>
									</div>
								</div>
							)}
							<p className="text-sm text-muted-foreground leading-relaxed">
								You already have a PhishAware account using this email. Sign in
								first, then reopen this link to join {invitation.orgName}.
							</p>
							<Button asChild variant="outline" className="w-full py-6 rounded-lg font-semibold">
								<Link href="/auth">Sign in</Link>
							</Button>
						</div>
					) : (
						<>
							{invitation.ssoAvailable && (
								<div className="relative">
									<div className="absolute inset-0 flex items-center">
										<span className="w-full border-t border-border" />
									</div>
									<div className="relative flex justify-center text-xs uppercase font-semibold tracking-wider">
										<span className="bg-card px-4 text-muted-foreground">
											Or set a password
										</span>
									</div>
								</div>
							)}
							<Form {...form}>
								<form onSubmit={form.handleSubmit(onAccept)} className="space-y-4">
									<FormField
										control={form.control}
										name="name"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="font-semibold text-foreground">
													Your name
												</FormLabel>
												<div className="relative">
													<User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground pointer-events-none" />
													<FormControl>
														<Input
															placeholder="Alex"
															className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
															{...field}
														/>
													</FormControl>
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
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
															placeholder="••••••••"
															className="pl-10 py-6 rounded-lg bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors"
															{...field}
														/>
													</FormControl>
												</div>
												<PasswordStrength password={password} />
												<FormMessage />
											</FormItem>
										)}
									/>
									<Button
										type="submit"
										className="w-full py-6 text-lg rounded-lg font-bold mt-2 shadow-sm"
										disabled={acceptMutation.isPending}
									>
										{acceptMutation.isPending ? "Joining…" : "Join organization"}
										<ArrowRight className="ml-2 h-5 w-5" />
									</Button>
								</form>
							</Form>
						</>
					)}
				</CardContent>
			</Card>
		</Shell>
	);
}
