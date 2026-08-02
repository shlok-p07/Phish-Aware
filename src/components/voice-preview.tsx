"use client";

import { useState } from "react";
import { AlertTriangle, PhoneCall, PhoneIncoming } from "lucide-react";

const CUES = [
  { id: "urgency_language", label: "Urgency or pressure to act fast" },
  { id: "credential_request", label: "Requests sensitive credentials" },
] as const;

type CueId = (typeof CUES)[number]["id"];

export function VoicePreview() {
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
        <span className="ml-2 text-xs font-semibold text-muted-foreground">Simulated call</span>
      </div>

      <div className="px-4 sm:px-5 py-5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <PhoneIncoming className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-sm">Bank Security</p>
            <p className="text-xs text-muted-foreground">Incoming call</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">3m 18s</span>
      </div>

      <div className="px-4 sm:px-5 py-4 border-b border-border text-sm leading-relaxed space-y-2">
        <p>
          <strong>Caller:</strong> We detected suspicious activity on your card ending in 4471.
        </p>
        <p>
          <strong>Caller:</strong>{" "}
          <span className={highlight("urgency_language")}>
            Your account will be locked in 10 minutes unless we verify immediately.
          </span>
        </p>
        <p>
          <strong>Caller:</strong>{" "}
          <span className={highlight("credential_request")}>
            Please read me your online banking password so I can secure the account.
          </span>
        </p>
      </div>

      <div className="px-4 sm:px-5 py-4 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          2 cues caught
          <span className="text-xs font-normal text-muted-foreground">(hover one to see where)</span>
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
              <PhoneCall className="w-3 h-3" />
              {cue.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
