"use client";

import { useState } from "react";
import { QrCode, Building2, AlertTriangle } from "lucide-react";

/**
 * A printed notice whose call to action is to scan a QR code.
 *
 * The code rendered here is **deliberately not scannable**. It is a decorative
 * pattern derived from the destination string, not a real encoding. A genuine
 * QR pointing at a plausible phishing URL would invite a trainee to scan it
 * with their own phone and leave the platform entirely, which is exactly the
 * behaviour the product exists to discourage -- and it would breach the rule
 * that no simulated attack ever reaches a real channel.
 *
 * The destination is therefore revealed in the interface instead, on hover or
 * focus, mirroring how the email vector reveals link targets. Inspecting where
 * the code goes is the skill being trained, so it has to be inspectable without
 * a phone.
 */

/** Deterministic pattern from the destination, so a scenario looks the same each time. */
function patternFor(seed: string, size = 11): boolean[][] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      h = Math.imul(h ^ (x * 31 + y * 17), 16777619);
      row.push(((h >>> 13) & 1) === 1);
    }
    rows.push(row);
  }
  // Finder squares in three corners, as a real code has -- this is what makes
  // the pattern read as a QR code rather than as noise.
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        rows[oy + y]![ox + x] = x === 0 || x === 2 || y === 0 || y === 2;
      }
    }
  };
  finder(0, 0);
  finder(size - 3, 0);
  finder(0, size - 3);
  return rows;
}

export function QrNotice({
  organisation,
  headline,
  body,
  destination,
  className = "",
}: {
  organisation: string;
  headline: string;
  body: string;
  /** Where the code claims to lead. Shown on demand, never navigable. */
  destination: string | null;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const grid = patternFor(destination ?? headline);

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-3">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold">{organisation}</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
          Posted notice
        </span>
      </div>

      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-3 min-w-0">
          <h3 className="font-display text-lg font-bold leading-snug">{headline}</h3>
          <p className="pa-measure whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            className="rounded-md border bg-white p-3"
            role="img"
            aria-label="Decorative QR code. Not scannable; use the button below to inspect its destination."
          >
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: `repeat(${grid.length}, 0.5rem)` }}
            >
              {grid.flatMap((row, y) =>
                row.map((on, x) => (
                  <span
                    key={`${y}-${x}`}
                    className={`h-2 w-2 ${on ? "bg-slate-900" : "bg-transparent"}`}
                  />
                )),
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            onMouseEnter={() => setRevealed(true)}
            onFocus={() => setRevealed(true)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={revealed}
          >
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            {revealed ? "Hide destination" : "Where does this go?"}
          </button>
        </div>
      </div>

      {revealed && (
        <div className="border-t bg-muted/30 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            The code resolves to
          </p>
          {destination ? (
            // Rendered as text, never as an anchor: this must not be navigable.
            <p className="pa-inspectable mt-1 font-mono text-xs">{destination}</p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              No destination was recorded for this notice.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
