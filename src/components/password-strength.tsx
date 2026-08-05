"use client";
import zxcvbn from "zxcvbn";
import { cn } from "@/lib/utils";

/** zxcvbn score a password must reach before we'll accept it. */
export const MIN_PASSWORD_SCORE = 2;

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
// Semantic, not decorative -- so these ride the theme tokens (and pick up
// high-contrast mode) rather than fixed palette values. The low end was already
// on --destructive; the rest were amber/emerald literals that ignored both.
const STRENGTH_COLORS = [
	"bg-destructive",
	"bg-destructive",
	"bg-warning",
	"bg-success",
	"bg-success",
] as const;

/** Shared by the signup form and the invitation accept page. */
export function PasswordStrength({ password }: { password: string }) {
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
