"use client";

import { useState } from "react";
import { splitUrl } from "@/components/practice/web-page";

/**
 * The one skill this product is really teaching, in the hero.
 *
 * A visitor hovers an address that looks like Microsoft's and watches the part
 * that actually owns the page separate itself from the part that was put there
 * to reassure them. It is the same emphasis the practice surface uses, from the
 * same splitUrl, so the marketing page is demonstrating the product rather than
 * illustrating it.
 *
 * Chosen over another decorative flourish because it earns the attention: the
 * reaction is "oh, I would have clicked that", which is the reason somebody
 * buys this.
 */
const SAMPLE = "https://login.microsoftonline.com.session-verify.net/auth";

export function DomainReveal() {
  const [open, setOpen] = useState(false);
  const { prefix, domain, rest } = splitUrl(SAMPLE);

  return (
    <div className="mt-8 max-w-md">
      <button
        type="button"
        // Hover for a pointer, focus and click for everyone else. A hover-only
        // reveal would hide the point of the product from keyboard and touch.
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pa-spotlight group w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="pa-spotlight-wash" />
        <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Would your team click this?
        </span>
        <span className="pa-inspectable block font-mono text-sm">
          <span
            className={`transition-opacity duration-300 ${
              open ? "opacity-40" : "opacity-100"
            } text-muted-foreground`}
          >
            {prefix}
          </span>
          <span
            className={`rounded px-0.5 transition-colors duration-300 ${
              open ? "bg-destructive/15 font-semibold text-destructive" : "text-foreground"
            }`}
          >
            {domain}
          </span>
          <span
            className={`transition-opacity duration-300 ${
              open ? "opacity-40" : "opacity-100"
            } text-muted-foreground`}
          >
            {rest}
          </span>
        </span>
        {/* Grid-rows rather than height, so the caption animates without a
            magic pixel value that breaks when the text wraps. */}
        <span
          className={`grid transition-[grid-template-rows,opacity] duration-300 ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <span className="overflow-hidden">
            <span className="pa-measure mt-2 block text-xs leading-relaxed text-muted-foreground">
              The owner is the last two parts before the first single slash &mdash;{" "}
              <strong className="font-semibold text-foreground">session-verify.net</strong>.
              Everything before it, &ldquo;microsoftonline.com&rdquo; included, is a
              subdomain that anyone can name whatever they like.
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
