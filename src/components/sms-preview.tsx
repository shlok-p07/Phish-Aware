"use client";

import { useState } from "react";
import { AlertTriangle, Link as LinkIcon, Phone } from "lucide-react";

/**
 * SMS counterpart to InboxPreview: a simulated smishing text exactly as it
 * appears in the real practice message thread (src/app/(app)/practice/page.tsx's
 * smsThread()), with the same cue vocabulary the product actually grades
 * against (src/server/cues.ts). Illustrative example data, not a live
 * product screenshot, but every label on it is real, not invented.
 */
const CUES = [
  { id: "urgency_language", label: "Urgency or pressure to act fast" },
  { id: "mismatched_link", label: "Suspicious or mismatched link" },
] as const;

type CueId = (typeof CUES)[number]["id"];

export function SmsPreview() {
  const [active, setActive] = useState<CueId | null>(null);

  const highlight = (id: CueId) =>
    active === id
      ? "bg-destructive/15 ring-1 ring-destructive/40 rounded px-1 -mx-1 transition-colors"
      : "px-1 -mx-1 transition-colors";

  return (
    <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
        <span className="ml-2 text-xs font-semibold text-muted-foreground">
          Simulated message
        </span>
      </div>

      <div className="px-4 sm:px-5 py-5 border-b border-border flex flex-col items-center gap-1.5">
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <Phone className="w-4 h-4" />
        </div>
        <span className="font-semibold text-sm">+1 (408) 267-3890</span>
      </div>

      <div className="px-4 sm:px-5 py-4 flex flex-col items-start gap-2">
        <span className="self-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Today &middot; 4:51 PM
        </span>
        <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
          Hi, this is Alex from ZenDesk. Our SSO plugin is having auth issues.{" "}
          <span className={highlight("urgency_language")}>
            Please verify your login ASAP to avoid downtime.
          </span>
        </p>
        <div
          className={`max-w-[85%] flex items-center gap-1.5 rounded-xl border p-2.5 text-xs text-primary ${highlight("mismatched_link")}`}
        >
          <LinkIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="underline decoration-dashed decoration-primary/50 break-all">
            zendesk-auth.us/confirm
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-5 py-4 bg-muted/60 border-t border-border">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          2 cues caught
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
