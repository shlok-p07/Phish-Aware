"use client";

import { useState } from "react";
import { Mail, MessageSquare, Phone, QrCode, AtSign, Globe } from "lucide-react";
import { InboxPreview } from "./inbox-preview";
import { SmsPreview } from "./sms-preview";
import { VoicePreview } from "./voice-preview";
import { QrNotice } from "./practice/qr-notice";
import { SocialDm } from "./practice/social-dm";
import { WebPage } from "./practice/web-page";
import { PRACTICE_VECTORS, type PracticeVector } from "@/server/attackProfiles";

/**
 * Lets a visitor flip the hero demo between every vector PhishAware supports.
 *
 * Driven off PRACTICE_VECTORS rather than a hand-written list, and asserted
 * exhaustive by the type of PREVIEWS: the previous version claimed in its own
 * docstring to show what the product supports while offering three of six, and
 * a hand-maintained list is how that happened. The three newest vectors reuse
 * the real practice surfaces with fixed sample content, so the hero shows a
 * visitor exactly what they will get rather than an approximation of it.
 */
const PREVIEWS: Record<
  PracticeVector,
  { label: string; icon: typeof Mail; render: () => React.ReactNode }
> = {
  email: { label: "Email", icon: Mail, render: () => <InboxPreview /> },
  sms: { label: "SMS", icon: MessageSquare, render: () => <SmsPreview /> },
  voice: { label: "Voice", icon: Phone, render: () => <VoicePreview /> },
  qr: {
    label: "QR code",
    icon: QrCode,
    render: () => (
      <QrNotice
        organisation="Facilities Management"
        headline="Parking permit renewal -- action required"
        body="All staff permits expire on Friday. Scan the code below to renew. Vehicles without a valid permit from Monday will be issued a charge by the site operator."
        destination="https://staff-permits-renew.info/login"
        className="w-full"
      />
    ),
  },
  social: {
    label: "Social DM",
    icon: AtSign,
    render: () => (
      <SocialDm
        sender="Dana Whitfield (@d.whitfield-recruiting)"
        body="Hi! I came across your profile and you're a strong match for a senior role we're hiring for -- fully remote, and the band is well above what you're on now. Easier to chat on WhatsApp. Could you fill in this short form first?"
        link="https://talent-verify.co/apply/register"
        className="w-full"
      />
    ),
  },
  web: {
    label: "Web page",
    icon: Globe,
    render: () => (
      <WebPage
        url="https://login.microsoftonline.com.session-verify.net/auth"
        headline="Sign in to continue"
        body="Your session has expired. Please confirm your credentials to restore access to your mailbox and files."
        secondaryLink="Forgot your password?"
        className="w-full"
      />
    ),
  },
};

export function VectorPreviewToggle() {
  const [vector, setVector] = useState<PracticeVector>("email");

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div
        role="group"
        aria-label="Choose a phishing vector to preview"
        className="inline-flex flex-wrap justify-center items-center gap-1 p-1 rounded-lg border border-border bg-card shadow-sm"
      >
        {PRACTICE_VECTORS.map((v) => {
          const { label, icon: Icon } = PREVIEWS[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVector(v)}
              aria-pressed={vector === v}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                vector === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      {PREVIEWS[vector].render()}
    </div>
  );
}
