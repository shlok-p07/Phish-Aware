"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Ghost, ArrowRight, Clock } from "lucide-react";
import { getGetCurrentUserQueryKey } from "@/api-client";
import { Button } from "@/components/ui/button";

/** Guest data (and their session) is purged one hour after the account is created. */
const GUEST_TTL_MS = 60 * 60 * 1000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Persistent nudge shown to guest users on every screen. Counts down the hour
 * of guest access; when it lapses it refreshes the session (which is now
 * expired server-side) so the app gate redirects them to sign in.
 */
export function GuestBanner({ createdAt }: { createdAt: string | Date }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const expiresAt = useMemo(
    () => new Date(createdAt).getTime() + GUEST_TTL_MS,
    [createdAt],
  );
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(expiresAt - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expired = remaining <= 0;

  useEffect(() => {
    if (expired) {
      queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    }
  }, [expired, queryClient]);

  return (
    // Uses the --warning token rather than the amber palette, so this banner
    // tracks the theme (and high-contrast mode) instead of carrying its own
    // hand-written dark: variants for every shade.
    <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-foreground">
      <Ghost className="h-5 w-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 text-sm font-semibold">
        {expired ? (
          <span>Your guest session has ended. Sign up to keep going.</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-1.5">
            You&apos;re browsing as a guest.
            <span className="text-muted-foreground">
              Sign up to save your progress before it&apos;s gone.
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs tabular-nums">
              <Clock className="h-3 w-3" />
              {formatRemaining(remaining)}
            </span>
          </span>
        )}
      </div>
      <Button
        size="sm"
        className="shrink-0 rounded-lg bg-warning text-warning-foreground font-bold hover:bg-warning/90 hover:cursor-pointer"
        onClick={() => router.push("/auth")}
      >
        Sign up
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  );
}
