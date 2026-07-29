"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Type, Zap, Contrast, BookOpenText, MousePointerClick, Trash2, AlertTriangle, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAccessibility, type TextSize } from "@/hooks/use-accessibility";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const TEXT_SIZE_OPTIONS: { value: TextSize; label: string; sample: string }[] = [
  { value: "normal", label: "Default", sample: "text-base" },
  { value: "large", label: "Large", sample: "text-lg" },
  { value: "xlarge", label: "Extra Large", sample: "text-xl" },
];

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/30 border border-transparent p-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground font-medium">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const {
    textSize,
    setTextSize,
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
    dyslexiaFont,
    setDyslexiaFont,
    largeTargets,
    setLargeTargets,
  } = useAccessibility();

  // Avoid hydration mismatch: theme is only known on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Request failed (${res.status})`);
      }
      queryClient.clear();
      toast({ title: "Account deleted", description: "Your account and all data have been removed." });
      router.push("/auth");
    } catch (err) {
      setDeleting(false);
      toast({
        title: "Couldn't delete account",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
		<div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<div className="space-y-1">
				<h1 className="text-3xl font-display font-bold flex items-center gap-3">
					<Settings className="w-8 h-8 text-primary" />
					Settings
				</h1>
				<p className="text-muted-foreground font-medium">
					Personalize how PhishAware looks and feels. Changes are saved
					automatically.
				</p>
			</div>

			{/* Appearance / Theme */}
			<Card className="border shadow-sm">
				<CardHeader className="bg-muted/30 border-b pb-4">
					<CardTitle className="text-lg flex items-center gap-2">
						<Sun className="w-5 h-5 text-secondary" />
						Appearance
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Choose a light or dark theme, or follow your device setting.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="grid grid-cols-3 gap-3">
						{THEME_OPTIONS.map((option) => {
							const active = mounted && theme === option.value;
							return (
								<button
									key={option.value}
									onClick={() => setTheme(option.value)}
									aria-pressed={active}
									className={cn(
										"flex flex-col items-center gap-2 rounded-lg border p-4 font-semibold transition-all hover:cursor-pointer",
										active
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
									)}
								>
									<option.icon className="w-6 h-6" />
									<span className="text-sm">{option.label}</span>
								</button>
							);
						})}
					</div>
				</CardContent>
			</Card>

			{/* Text size */}
			<Card className="border shadow-sm">
				<CardHeader className="bg-muted/30 border-b pb-4">
					<CardTitle className="text-lg flex items-center gap-2">
						<Type className="w-5 h-5 text-primary" />
						Text Size
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Increase the text size across the app for easier reading.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="grid grid-cols-3 gap-3">
						{TEXT_SIZE_OPTIONS.map((option) => {
							const active = textSize === option.value;
							return (
								<button
									key={option.value}
									onClick={() => setTextSize(option.value)}
									aria-pressed={active}
									className={cn(
										"flex flex-col items-center gap-2 rounded-lg border p-4 font-semibold transition-all hover:cursor-pointer",
										active
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
									)}
								>
									<span className={cn("font-bold leading-none", option.sample)}>
										Aa
									</span>
									<span className="text-sm">{option.label}</span>
								</button>
							);
						})}
					</div>
				</CardContent>
			</Card>

			{/* Reading */}
			<Card className="border shadow-sm">
				<CardHeader className="bg-muted/30 border-b pb-4">
					<CardTitle className="text-lg flex items-center gap-2">
						<BookOpenText className="w-5 h-5 text-primary" />
						Reading
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Adjust typography to make text easier to read.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<ToggleRow
						id="dyslexia-font"
						label="Dyslexia-friendly font"
						description="Switches to Atkinson Hyperlegible with wider spacing for improved readability."
						checked={dyslexiaFont}
						onCheckedChange={setDyslexiaFont}
					/>
				</CardContent>
			</Card>

			{/* Contrast */}
			<Card className="border shadow-sm">
				<CardHeader className="bg-muted/30 border-b pb-4">
					<CardTitle className="text-lg flex items-center gap-2">
						<Contrast className="w-5 h-5 text-primary" />
						Contrast
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Boost borders and text contrast for improved legibility.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<ToggleRow
						id="high-contrast"
						label="High contrast mode"
						description="Strengthens borders, focus outlines, and muted text so elements stand out."
						checked={highContrast}
						onCheckedChange={setHighContrast}
					/>
				</CardContent>
			</Card>

			{/* Interaction */}
			<Card className="border shadow-sm">
				<CardHeader className="bg-muted/30 border-b pb-4">
					<CardTitle className="text-lg flex items-center gap-2">
						<MousePointerClick className="w-5 h-5 text-secondary" />
						Interaction
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Make buttons and controls easier to tap and click.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<ToggleRow
						id="large-targets"
						label="Larger click targets"
						description="Enlarges buttons, links, and controls to at least 44×44px for easier tapping."
						checked={largeTargets}
						onCheckedChange={setLargeTargets}
					/>
				</CardContent>
			</Card>

			{/* Motion */}
			<Card className="border shadow-sm">
				<CardHeader className="bg-muted/30 border-b pb-4">
					<CardTitle className="text-lg flex items-center gap-2">
						<Zap className="w-5 h-5 text-secondary" />
						Motion
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Reduce animations and transitions throughout the app.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<ToggleRow
						id="reduce-motion"
						label="Reduce motion"
						description="Minimizes movement for a calmer, more comfortable experience."
						checked={reduceMotion}
						onCheckedChange={setReduceMotion}
					/>
				</CardContent>
			</Card>

			{/* Danger zone — delete account */}
			<Card className="border border-destructive/40 shadow-sm">
				<CardHeader className="bg-destructive/5 border-b border-destructive/20 pb-4">
					<CardTitle className="text-lg flex items-center gap-2 text-destructive">
						<AlertTriangle className="w-5 h-5" />
						Danger Zone
					</CardTitle>
					<CardDescription className="text-sm font-medium">
						Permanently delete your account. This cannot be undone.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-destructive/5 border border-destructive/20 p-4">
						<div className="space-y-1">
							<p className="text-sm font-semibold">Delete account</p>
							<p className="text-xs text-muted-foreground font-medium">
								Removes your profile, progress, points, streak, and every practice
								attempt for good.
							</p>
						</div>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="destructive"
									className="shrink-0 rounded-lg font-bold hover:cursor-pointer"
									disabled={deleting}
								>
									<Trash2 className="w-4 h-4 mr-2" />
									{deleting ? "Deleting..." : "Delete account"}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete your account?</AlertDialogTitle>
									<AlertDialogDescription>
										This permanently deletes{" "}
										{user?.isGuest ? "your guest account" : "your account"} and
										all of your data — progress, points, streak, milestones, and
										practice history. This action cannot be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel
										disabled={deleting}
										className="hover:cursor-pointer"
									>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										onClick={handleDeleteAccount}
										disabled={deleting}
										className="bg-destructive text-white hover:bg-destructive/90 hover:cursor-pointer"
									>
										{deleting ? "Deleting..." : "Yes, delete everything"}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
