"use client";

import { useState } from "react";
import { AlertTriangle, Check, X, MousePointer2 } from "lucide-react";
import type { LessonScreen } from "@/db/models/lessons";

/**
 * Renders one lesson screen.
 *
 * The original lesson format was a heading and a paragraph, which assumed the
 * reader already knew what a sender address was and what a suspicious one
 * looked like. These screens are built for someone meeting the material for the
 * first time: a worked example with the relevant characters pointed at, the
 * genuine and the fake side by side, the checks in the order you would do them,
 * and a question to answer before moving on.
 *
 * Nothing here is decorative. Each kind exists because a different thing is
 * hard to learn from prose alone.
 */

const CALLOUT_LABEL: Record<string, string> = {
  displayName: "The name shown",
  address: "The real address",
  subject: "The subject line",
  body: "The greeting",
  link: "The link",
};

function Prose({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{heading}</h2>
      <div className="space-y-4">
        {body.split("\n\n").map((para, i) => (
          <p key={i} className="pa-measure-wide text-lg font-medium leading-relaxed text-muted-foreground">
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * The numbered notes beside an annotated sample. Hovering, focusing or clicking
 * one lights up the part it refers to -- reading the note and seeing the detail
 * at the same time is the whole point, so this is shared rather than
 * reimplemented per medium.
 */
function CalloutList({
  callouts,
  active,
  onActivate,
}: {
  callouts: { label: string; detail: string }[];
  active: number | null;
  onActivate: (index: number | null) => void;
}) {
  return (
    <ol className="space-y-2">
      {callouts.map((c, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onActivate(active === i ? null : i)}
            onMouseEnter={() => onActivate(i)}
            onFocus={() => onActivate(i)}
            aria-expanded={active === i}
            className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active === i ? "border-primary bg-primary/5" : ""
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                {i + 1}
              </span>
              {c.label}
            </span>
            {active === i && (
              <span className="pa-measure mt-2 block text-sm leading-relaxed text-muted-foreground">
                {c.detail}
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * A sample from a non-email medium, with the same callout exercise. The frame
 * caption and labelled rows let a call transcript read as a call and a notice as
 * a notice, instead of being forced into From/Subject fields that would teach
 * the wrong thing.
 */
function Annotated({ screen }: { screen: Extract<LessonScreen, { kind: "annotated" }> }) {
  const [active, setActive] = useState<number | null>(null);
  const activeTarget = active === null ? null : screen.callouts[active]!.target;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{screen.heading}</h2>
      <p className="pa-measure-wide leading-relaxed text-muted-foreground">{screen.intro}</p>

      <div className="overflow-hidden rounded-lg border bg-card">
        <p className="border-b bg-muted/40 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {screen.frame}
        </p>
        <div className="space-y-3 px-5 py-4 text-sm">
          {screen.parts.map((part) => {
            const lit =
              activeTarget === part.id
                ? "bg-primary/15 ring-2 ring-primary rounded px-1 -mx-1"
                : "";
            return (
              <p key={part.id} className="leading-relaxed">
                {part.label ? (
                  <span className="text-muted-foreground">{part.label}: </span>
                ) : null}
                <span
                  className={`${part.mono ? "pa-inspectable font-mono text-xs" : ""} ${
                    part.label ? "font-semibold" : "whitespace-pre-line"
                  } ${lit}`}
                >
                  {part.value}
                </span>
              </p>
            );
          })}
        </div>
      </div>

      <CalloutList
        callouts={screen.callouts.map((c) => ({ label: c.label, detail: c.detail }))}
        active={active}
        onActivate={setActive}
      />
    </div>
  );
}

function Anatomy({ screen }: { screen: Extract<LessonScreen, { kind: "anatomy" }> }) {
  const [active, setActive] = useState<number | null>(null);
  const activeTarget = active === null ? null : screen.callouts[active]!.target;
  const lit = (t: string) =>
    activeTarget === t ? "bg-primary/15 ring-2 ring-primary rounded px-1 -mx-1" : "";

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{screen.heading}</h2>
      <p className="pa-measure-wide leading-relaxed text-muted-foreground">{screen.intro}</p>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="space-y-1.5 border-b bg-muted/40 px-5 py-4 text-sm">
          <p>
            <span className="text-muted-foreground">From: </span>
            <span className={`font-semibold ${lit("displayName")}`}>{screen.sample.displayName}</span>{" "}
            {/* One text node, not three: a screen reader reads the address as a
                single string rather than "less-than", the address, "greater-than". */}
            <span className={`pa-inspectable font-mono text-xs ${lit("address")}`}>
              {`<${screen.sample.address}>`}
            </span>
          </p>
          <p className={`font-semibold ${lit("subject")}`}>{screen.sample.subject}</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className={`whitespace-pre-line text-sm leading-relaxed ${lit("body")}`}>
            {screen.sample.body}
          </p>
          <div className={`inline-flex flex-col gap-1 ${lit("link")}`}>
            <span className="w-fit rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              {screen.sample.linkText}
            </span>
            <span className="pa-inspectable flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <MousePointer2 className="h-3 w-3" aria-hidden="true" />
              {screen.sample.linkHref}
            </span>
          </div>
        </div>
      </div>

      <CalloutList
        callouts={screen.callouts.map((c) => ({
          label: CALLOUT_LABEL[c.target] ?? c.target,
          detail: c.detail,
        }))}
        active={active}
        onActivate={setActive}
      />
    </div>
  );
}

function Compare({ screen }: { screen: Extract<LessonScreen, { kind: "compare" }> }) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{screen.heading}</h2>
      <p className="pa-measure-wide leading-relaxed text-muted-foreground">{screen.intro}</p>
      <div className="space-y-4">
        {screen.rows.map((r, i) => (
          <div key={i} className="rounded-lg border overflow-hidden">
            <p className="border-b bg-muted/40 px-4 py-2 text-[11px] font-bold uppercase tracking-wide">
              {r.label}
            </p>
            {/* Two columns only once there is room. At the old container width
                each side was about 300px, so the longest real address in the
                library -- 56 characters -- could not fit and wrapped mid-token.
                A 5xl container gives about 456px a side, which clears it. */}
            <div className="grid md:grid-cols-2">
              <div className="space-y-1 border-b p-4 md:border-b-0 md:border-r">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Genuine
                </p>
                <p className="pa-inspectable font-mono text-xs">{r.genuine}</p>
              </div>
              <div className="space-y-1 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-destructive">
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Fake
                </p>
                <p className="pa-inspectable font-mono text-xs">{r.fake}</p>
              </div>
            </div>
            <p className="border-t bg-muted/20 px-4 py-2.5 text-sm leading-relaxed text-muted-foreground">
              {r.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Steps({ screen }: { screen: Extract<LessonScreen, { kind: "steps" }> }) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{screen.heading}</h2>
      <p className="pa-measure-wide leading-relaxed text-muted-foreground">{screen.intro}</p>
      <ol className="space-y-4">
        {screen.steps.map((s, i) => (
          <li key={i} className="rounded-lg border p-4">
            <p className="flex gap-2.5 font-bold">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {i + 1}
              </span>
              {s.action}
            </p>
            <dl className="mt-3 space-y-2 pl-8.5 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-success">
                  What you want to see
                </dt>
                <dd className="leading-relaxed text-muted-foreground">{s.lookFor}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Warning sign
                </dt>
                <dd className="leading-relaxed text-muted-foreground">{s.warningSign}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Checkpoint({ screen }: { screen: Extract<LessonScreen, { kind: "checkpoint" }> }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const answer = chosen === null ? null : screen.options[chosen]!;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{screen.heading}</h2>
      <p className="pa-measure-wide text-lg font-medium leading-relaxed">{screen.prompt}</p>
      <div className="grid gap-3">
        {screen.options.map((o, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setChosen(i)}
            aria-pressed={chosen === i}
            className={`rounded-lg border p-4 text-left font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              chosen === i
                ? o.correct
                  ? "border-success bg-success/10"
                  : "border-destructive bg-destructive/10"
                : ""
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {answer && (
        <div
          role="status"
          className={`pa-rise rounded-lg border p-4 ${
            answer.correct ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            {answer.correct ? (
              <>
                <Check className="h-4 w-4 text-success" aria-hidden="true" /> That is the one
              </>
            ) : (
              <>
                <X className="h-4 w-4 text-destructive" aria-hidden="true" /> Not the strongest reason
              </>
            )}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{answer.feedback}</p>
        </div>
      )}
    </div>
  );
}

export function LessonScreenView({ screen }: { screen: LessonScreen }) {
  switch (screen.kind) {
    case "annotated":
      return <Annotated screen={screen} />;
    case "anatomy":
      return <Anatomy screen={screen} />;
    case "compare":
      return <Compare screen={screen} />;
    case "steps":
      return <Steps screen={screen} />;
    case "checkpoint":
      return <Checkpoint screen={screen} />;
    // `prose` is the original shape and leaves `kind` unset, so it is also the
    // default: a lesson written before this change still renders.
    default:
      return <Prose heading={screen.heading} body={screen.body} />;
  }
}
