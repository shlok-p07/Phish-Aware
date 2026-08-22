"use client";

import { useState } from "react";
import { BadgeCheck, Link2, AlertTriangle, UserPlus } from "lucide-react";

/**
 * An unsolicited direct message on a professional network.
 *
 * What a trainee can actually inspect here is different from an inbox. There is
 * no sender domain and no attachment; the tells are the handle, how new and how
 * thin the profile is, and where the one link goes. So the profile card is part
 * of the exercise rather than decoration -- it is rendered collapsed and opens
 * on demand, the same "look before you act" gesture the email vector trains
 * with link targets.
 *
 * As everywhere else in practice, the link is never a real anchor: a simulated
 * attack must not be able to reach a real channel, and a trainee should not be
 * invited to leave the platform for a URL built to look hostile.
 */

/** Splits "Dana Whitfield (@d.whitfield-recruiting)" into its two halves. */
export function splitProfile(sender: string): { name: string; handle: string | null } {
  const match = sender.match(/^(.*?)\s*\((@?[^)]+)\)\s*$/);
  if (match) {
    return { name: match[1]!.trim(), handle: match[2]!.trim() };
  }
  // A generator that returned a bare name still has to render as something.
  return { name: sender.trim(), handle: null };
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

export function SocialDm({
  sender,
  body,
  link,
  className = "",
}: {
  /** Display name and handle, as the message list shows them. */
  sender: string;
  body: string;
  /** The one link in the message. Shown on demand, never navigable. */
  link: string | null;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { name, handle } = splitProfile(sender);

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-3">
        <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold">New message request</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
          Direct message
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
            aria-hidden="true"
          >
            {initialsFor(name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{name}</p>
            {handle ? (
              <p className="pa-inspectable font-mono text-xs text-muted-foreground">{handle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={profileOpen}
          >
            {profileOpen ? "Hide profile" : "View profile"}
          </button>
        </div>

        {profileOpen && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-3 text-xs">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                Connections in common
              </dt>
              <dd className="mt-0.5 tabular-nums">0</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                Profile created
              </dt>
              <dd className="mt-0.5">This week</dd>
            </div>
            <div className="col-span-2">
              <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                Verification
              </dt>
              <dd className="mt-0.5 flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                Not verified
              </dd>
            </div>
          </dl>
        )}

        <div className="rounded-lg rounded-tl-none border bg-muted/30 px-4 py-3">
          <p className="pa-measure whitespace-pre-line text-sm leading-relaxed">{body}</p>
        </div>

        {link ? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            onMouseEnter={() => setRevealed(true)}
            onFocus={() => setRevealed(true)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={revealed}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            {revealed ? "Hide link target" : "Where does this link go?"}
          </button>
        ) : null}
      </div>

      {revealed && (
        <div className="border-t bg-muted/30 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            The link resolves to
          </p>
          {link ? (
            // Text, never an anchor -- this must not be navigable.
            <p className="pa-inspectable mt-1 font-mono text-xs">{link}</p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              No destination was recorded for this message.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
