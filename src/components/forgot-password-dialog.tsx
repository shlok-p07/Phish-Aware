"use client";

import { useState } from "react";
import { useRequestPasswordReset, useConfirmPasswordReset } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Step = "email" | "code";

/**
 * No email delivery in this app -- requesting a reset code returns it
 * directly in the response, and this dialog just shows it on-screen (and
 * pre-fills it below) instead of telling anyone to go check an inbox.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail = "",
  onResetComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fills the address, e.g. the one that just got locked out. */
  initialEmail?: string;
  /** Fired once the new password is saved -- the account is unlocked by then. */
  onResetComplete?: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const requestReset = useRequestPasswordReset();
  const confirmReset = useConfirmPasswordReset();

  const reset = () => {
    setStep("email");
    setEmail(initialEmail);
    setRevealedCode(null);
    setCode("");
    setNewPassword("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleRequestCode = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate(
      { data: { email } },
      {
        onSuccess: (data) => {
          // In production the server never returns a code -- handing one to an
          // unauthenticated caller would be an account takeover for anyone who
          // knows the address -- so the honest instruction is where to get one.
          // The code step still opens, because a member who has been given a
          // code by their admin redeems it here.
          if (data.delivery === "out_of_band") {
            setRevealedCode(null);
            setStep("code");
            toast({
              title: "Code sent",
              description: "Check the channel your organization uses, then enter it below.",
            });
            return;
          }
          if (data.delivery === "administrator") {
            setRevealedCode(null);
            setStep("code");
            return;
          }
          if (!data.code) {
            toast({
              title: "No account found",
              description: "That email doesn't match an account with a password.",
              variant: "destructive",
            });
            return;
          }
          setRevealedCode(data.code);
          setCode(data.code);
          setStep("code");
        },
        onError: () => {
          toast({ title: "Something went wrong", description: "Try again in a moment.", variant: "destructive" });
        },
      },
    );
  };

  const handleConfirmReset = (e: React.FormEvent) => {
    e.preventDefault();
    confirmReset.mutate(
      { data: { email, code, newPassword } },
      {
        onSuccess: () => {
          toast({ title: "Password updated", description: "You can log in with your new password now." });
          handleOpenChange(false);
          onResetComplete?.();
        },
        onError: (err) => {
          toast({
            title: "Couldn't reset your password",
            description: err.message || "That code may be wrong or expired.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {step === "email" ? (
          <form onSubmit={handleRequestCode}>
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                Enter the email on your account to get a reset code.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                required
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={requestReset.isPending}>
                {requestReset.isPending ? "Checking..." : "Get reset code"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset}>
            <DialogHeader>
              <DialogTitle>Enter your code</DialogTitle>
              <DialogDescription>It&apos;s good for 15 minutes.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {revealedCode ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Your reset code
                  </p>
                  <p className="text-2xl font-bold tracking-widest">{revealedCode}</p>
                </div>
              ) : (
                <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Ask an administrator at your organization to issue you a reset
                  code, then enter it below. Codes are good for 15 minutes.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="reset-code">Reset code</Label>
                <Input
                  id="reset-code"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-new-password">New password</Label>
                <Input
                  id="reset-new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-col gap-2">
              <Button type="submit" className="w-full" disabled={confirmReset.isPending}>
                {confirmReset.isPending ? "Resetting..." : "Reset password"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("email")}>
                Use a different email
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
