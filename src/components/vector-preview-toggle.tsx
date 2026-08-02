"use client";

import { useState } from "react";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { InboxPreview } from "./inbox-preview";
import { SmsPreview } from "./sms-preview";
import { VoicePreview } from "./voice-preview";

/**
 * Lets a visitor flip the hero demo between the practice vectors PhishAware
 * currently supports (src/server/attackProfiles.ts's PRACTICE_VECTORS),
 * instead of only ever showing email.
 */
export function VectorPreviewToggle() {
  const [vector, setVector] = useState<"email" | "sms" | "voice">("email");

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setVector("email")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            vector === "email"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </button>
        <button
          type="button"
          onClick={() => setVector("sms")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            vector === "sms"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          SMS
        </button>
        <button
          type="button"
          onClick={() => setVector("voice")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            vector === "voice"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          Voice
        </button>
      </div>
      {vector === "email" ? <InboxPreview /> : vector === "sms" ? <SmsPreview /> : <VoicePreview />}
    </div>
  );
}
