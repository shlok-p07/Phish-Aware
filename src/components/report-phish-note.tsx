"use client";

import { Siren } from "lucide-react";

/**
 * What to do about a real one.
 *
 * The gap this closes: a learner finishes a scenario having correctly spotted a
 * phishing email, and the product has taught them nothing about what to actually
 * do next. "Report it to your security team" is not a procedure -- every
 * organisation has a different mailbox, form or button, and an employee who does
 * not know theirs will simply delete the message. So this renders the address
 * their own administrator configured, at the moment they have just proved they
 * can recognise one.
 *
 * Shown only for scenarios that were genuinely phishing. Appending a reporting
 * prompt to a legitimate message would teach the opposite of the lesson.
 */

/**
 * Both accepted channel shapes, re-checked before either reaches an href.
 *
 * The server validates this on write and again on read; this is the third check,
 * for the same reason the accent colour has one. A `javascript:` URL in an href
 * is a click away from running, and the cost of being sure is a regex.
 */
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const HTTPS = /^https:\/\/[^\s]+$/i;

/** Null when the value is not something safe to link to. */
export function reportHref(channel: string): string | null {
  if (EMAIL.test(channel)) return `mailto:${channel}`;
  if (HTTPS.test(channel)) return channel;
  return null;
}

export function ReportPhishNote({
  channel,
  instructions,
  orgName,
}: {
  channel: string | null | undefined;
  instructions: string | null | undefined;
  orgName?: string | null;
}) {
  if (!channel) return null;
  const href = reportHref(channel);
  if (!href) return null;
  const isEmail = href.startsWith("mailto:");

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Siren className="h-3.5 w-3.5" aria-hidden="true" />
        If you get a real one
      </p>
      <p className="pa-measure mt-1.5 text-sm leading-relaxed">
        {orgName ? `At ${orgName}, report it` : "Report it"}{" "}
        {isEmail ? "to " : "using "}
        <a
          href={href}
          // The link leaves the app, and for the https case it goes to a host
          // this organisation nominated rather than one we control.
          {...(isEmail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          className="font-semibold text-primary underline decoration-dotted underline-offset-2"
        >
          {channel}
        </a>
        .
      </p>
      {instructions && (
        // Plain text, escaped by React. Never HTML -- see orgBranding.ts.
        <p className="pa-measure mt-2 text-sm text-muted-foreground">{instructions}</p>
      )}
    </div>
  );
}
