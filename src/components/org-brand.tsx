"use client";

import Image from "next/image";
import { useState } from "react";
import { Building2 } from "lucide-react";

/**
 * Applies an organisation's own colour to the app.
 *
 * The value is written as CSS custom properties on a <style> element scoped to
 * :root, which is the one place a single colour can retint buttons, links and
 * focus rings without every component knowing about branding.
 *
 * Injecting a string into CSS is exactly the kind of thing that goes wrong, so
 * the value is checked again here even though the server already validated it on
 * write and on read. Three independent checks is not paranoia for a value that
 * originates from a form, crosses the network, and lands in a stylesheet: it
 * costs one regex, and the failure mode it prevents is an organisation's admin
 * account being used to restyle or cover the UI its own employees see.
 *
 * The foreground is computed rather than configurable. An admin who picks their
 * brand's pale yellow should not end up with white-on-yellow buttons, and asking
 * them to choose a text colour too would just move the problem.
 */
const SAFE_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Converts `#rrggbb` into the `H S% L%` channel triplet this theme stores.
 *
 * Not cosmetic -- this is the bug that made branding do nothing at all. The
 * design tokens hold bare HSL channels and are consumed as `hsl(var(--primary))`
 * (see globals.css), so writing a hex produced `hsl(#0f766e)`, which is invalid
 * CSS. The browser dropped the declaration and every branded colour silently
 * stayed default. It looked like the setting had not saved.
 *
 * Emitting channels also makes `--primary-border` work for free: it derives
 * itself from `--primary` with `hsl(from ...)`.
 */
export function hexToHslChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

export function OrgAccent({ accentColor }: { accentColor: string | null | undefined }) {
  if (!accentColor || !SAFE_HEX.test(accentColor)) return null;

  const channels = hexToHslChannels(accentColor);
  // Tailwind's tokens are the indirection: overriding --primary retints
  // everything built on it, so nothing needs a branded variant.
  const css = `:root{--primary:${channels};--primary-foreground:${readableForeground(accentColor)};--ring:${channels};}`;

  // Not user-authored markup: a validated hex, converted to three numbers, in a
  // fixed template. There is no other way to set a custom property at :root from
  // a client component, and a style attribute on a wrapper would not reach the
  // tokens components already consume.
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * Black or white channels, whichever is readable on this colour.
 *
 * Returned as channels rather than a hex for the same reason as above: the
 * theme's foreground token is consumed through hsl() too.
 */
function readableForeground(hex: string): string {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.179 ? "0 0% 0%" : "0 0% 100%";
}

/**
 * An organisation's logo, falling back to the product mark.
 *
 * Remote images fail: a CDN moves, a URL rots, an employee is on a network that
 * blocks it. A broken-image icon in the corner of the sidebar looks like the
 * product is broken, so a failure falls back to the same placeholder an
 * organisation with no logo gets.
 *
 * referrerPolicy is set because the logo host is third-party by definition, and
 * it should not learn which pages of an internal tool employees are on.
 */
export function OrgLogo({
  logoUrl,
  orgName,
  className = "",
}: {
  logoUrl: string | null | undefined;
  orgName: string | null | undefined;
  className?: string;
}) {
  // Which URL failed, rather than a boolean: a new URL then gets a fresh
  // attempt for free, where a flag would need an effect to reset it -- and
  // resetting state from an effect is both an extra render and the thing the
  // React Compiler rules flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const usable = logoUrl && /^https:\/\//i.test(logoUrl) && failedUrl !== logoUrl;

  if (!usable) {
    return (
      <span
        className={`flex items-center justify-center rounded-md bg-primary/10 text-primary ${className}`}
        aria-hidden="true"
      >
        <Building2 className="h-4 w-4" />
      </span>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt={orgName ? `${orgName} logo` : "Organisation logo"}
      width={28}
      height={28}
      // Arbitrary customer CDNs cannot all be listed in next.config, and
      // optimising someone else's logo is not worth proxying every request.
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(logoUrl)}
      className={`rounded-md object-contain ${className}`}
    />
  );
}
