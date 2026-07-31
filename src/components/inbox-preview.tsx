"use client";

import { useState } from "react";
import { AlertTriangle, Paperclip, ShieldAlert } from "lucide-react";

/**
 * Interactive hero visual: a simulated phishing email exactly as it appears
 * in the real practice inbox, with the same cue vocabulary the product
 * actually grades against (src/server/cues.ts) -- illustrative example
 * data, not a live product screenshot, but every label on it is real, not
 * invented. Hovering/focusing a cue chip highlights the exact part of the
 * email it's flagging, so a visitor experiences the core mechanic (spot the
 * cue, see why it matters) before ever signing up.
 */
const CUES = [
  { id: "sender_domain", label: "Mismatched sender domain" },
  { id: "urgency_language", label: "Urgency or pressure to act fast" },
  { id: "mismatched_link", label: "Suspicious or mismatched link" },
] as const;

type CueId = (typeof CUES)[number]["id"];

export function InboxPreview() {
  const [active, setActive] = useState<CueId | null>(null);

  const highlight = (id: CueId) =>
    active === id
      ? "bg-destructive/15 ring-1 ring-destructive/40 rounded px-1 -mx-1 transition-colors"
      : "px-1 -mx-1 transition-colors";

  return (
    <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-xs font-semibold text-muted-foreground">
          Simulated inbox
        </span>
      </div>

      <div className="px-4 sm:px-5 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">
              IT Security{" "}
              <span className={`font-normal text-muted-foreground ${highlight("sender_domain")}`}>
                &lt;it-support@accounts-verify-portal.com&gt;
              </span>
            </p>
            <p className="font-bold mt-1">
              Action required: verify your account in 24 hours
            </p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">9:41 AM</span>
        </div>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          We detected unusual sign-in activity.{" "}
          <span className={highlight("urgency_language")}>
            Click below to confirm your identity before your access is
            suspended.
          </span>
        </p>
        <div
          className={`mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all ${
            active === "mismatched_link" ? "ring-2 ring-destructive/50 ring-offset-2 ring-offset-card" : ""
          }`}
        >
          Verify My Account →
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="w-3.5 h-3.5" />
          security_notice.pdf
        </div>
      </div>

      <div className="px-4 sm:px-5 py-4 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <ShieldAlert className="w-4 h-4 text-destructive" />
          3 cues caught
          <span className="text-xs font-normal text-muted-foreground">
            (hover one to see where)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CUES.map((cue) => (
            <button
              key={cue.id}
              type="button"
              onMouseEnter={() => setActive(cue.id)}
              onMouseLeave={() => setActive((a) => (a === cue.id ? null : a))}
              onFocus={() => setActive(cue.id)}
              onBlur={() => setActive((a) => (a === cue.id ? null : a))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                active === cue.id
                  ? "border-destructive bg-destructive/20 text-destructive"
                  : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {cue.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
