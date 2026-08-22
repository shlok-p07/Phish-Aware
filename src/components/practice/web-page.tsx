"use client";

import { useState } from "react";
import { Lock, ShieldAlert, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

/**
 * A sign-in page the trainee has "landed on", drawn inside browser chrome.
 *
 * On this vector the address bar is the whole exercise: everything else on a
 * spoofed page can be pixel-perfect, and the domain is the one thing the
 * attacker cannot fake. So the URL is rendered as the most prominent element,
 * with the registrable domain emphasised out of the rest of it -- reading past
 * a convincing subdomain is the specific habit being trained.
 *
 * The form is inert by construction. Every field is disabled, so a trainee
 * cannot type a real password into a simulated attack even by reflex, and there
 * is no submit path at all.
 */

/**
 * Splits a URL for display: the scheme and any leading subdomains, the
 * registrable domain, then the path.
 *
 * The emphasis is a teaching aid, not a security control -- "registrable" here
 * is the last two labels, which is right for `co.uk`-style hosts less often
 * than a real public-suffix list would be. It is deliberately not used to
 * decide anything; it only decides what to embolden.
 */
export function splitUrl(url: string): { prefix: string; domain: string; rest: string } {
  const match = url.match(/^([a-z]+:\/\/)?([^/?#]*)(.*)$/i);
  if (!match) return { prefix: "", domain: url, rest: "" };
  const scheme = match[1] ?? "";
  const host = match[2] ?? "";
  const rest = match[3] ?? "";
  const labels = host.split(".");
  if (labels.length <= 2) {
    return { prefix: scheme, domain: host, rest };
  }
  const domain = labels.slice(-2).join(".");
  const subdomains = labels.slice(0, -2).join(".");
  return { prefix: `${scheme}${subdomains}.`, domain, rest };
}

export function WebPage({
  url,
  headline,
  body,
  secondaryLink,
  className = "",
}: {
  /** The address exactly as the bar would show it. */
  url: string;
  headline: string;
  body: string;
  /** A secondary link printed on the page, if the scenario has one. */
  secondaryLink: string | null;
  className?: string;
}) {
  const [certOpen, setCertOpen] = useState(false);
  const { prefix, domain, rest } = splitUrl(url);
  const isHttps = /^https:\/\//i.test(url);

  return (
    <div className={`overflow-hidden rounded-lg border bg-card ${className}`}>
      {/* Browser chrome */}
      <div className="space-y-2 border-b bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="ml-1 flex gap-0.5 text-muted-foreground/50" aria-hidden="true">
            <ChevronLeft className="h-3.5 w-3.5" />
            <ChevronRight className="h-3.5 w-3.5" />
            <RotateCw className="h-3 w-3 self-center" />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setCertOpen((o) => !o)}
            className="shrink-0 rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={certOpen}
            aria-label="Connection details"
          >
            {isHttps ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
            )}
          </button>
          {/* One text node per part so the domain can be emphasised without
              splitting the address into separately-read fragments. */}
          <p className="pa-inspectable min-w-0 flex-1 font-mono text-xs">
            <span className="text-muted-foreground">{prefix}</span>
            <span className="font-semibold text-foreground">{domain}</span>
            <span className="text-muted-foreground">{rest}</span>
          </p>
        </div>

        {certOpen && (
          <div className="rounded-md border bg-background px-3 py-2 text-xs">
            <p className="font-semibold">
              {isHttps ? "Connection is encrypted" : "Connection is not private"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {isHttps
                ? // The lock is the most misread indicator on the web: it says
                  // the connection is encrypted, not that the site is genuine.
                  "The certificate was issued to " +
                  domain +
                  ". Encryption says nobody can read this traffic. It does not say who is on the other end -- anyone can get a certificate for a domain they own."
                : "This page is served over plain HTTP. Anything typed into it travels unencrypted."}
            </p>
          </div>
        )}
      </div>

      {/* Page content */}
      <div className="space-y-5 px-6 py-8">
        <div className="space-y-2 text-center">
          <h3 className="font-display text-xl font-bold leading-snug">{headline}</h3>
          <p className="pa-measure mx-auto whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>

        <fieldset
          disabled
          className="mx-auto max-w-sm space-y-3"
          aria-describedby="pa-web-inert-note"
        >
          <legend className="sr-only">Sign in</legend>
          <div className="space-y-1">
            <label
              htmlFor="pa-web-user"
              className="text-xs font-semibold text-muted-foreground"
            >
              Email or username
            </label>
            <input
              id="pa-web-user"
              type="text"
              placeholder="you@company.com"
              className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="pa-web-pass"
              className="text-xs font-semibold text-muted-foreground"
            >
              Password
            </label>
            <input
              id="pa-web-pass"
              type="password"
              placeholder="••••••••"
              className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm"
            />
          </div>
          <div className="w-full rounded-md bg-primary/70 px-3 py-2 text-center text-sm font-semibold text-primary-foreground">
            Sign in
          </div>
          <p id="pa-web-inert-note" className="text-center text-[11px] text-muted-foreground">
            This form is part of the simulation and cannot be filled in or submitted.
          </p>
        </fieldset>

        {secondaryLink ? (
          // Text, never an anchor: nothing in a simulated attack is navigable.
          <p className="text-center text-xs font-medium text-primary underline decoration-dotted">
            {secondaryLink}
          </p>
        ) : null}
      </div>
    </div>
  );
}
