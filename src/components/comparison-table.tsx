import { X, Check } from "lucide-react";

const ROWS = [
  { old: "The same annual template everyone's already seen", new: "A different AI-written scenario every round" },
  { old: "One difficulty for the whole company", new: "Rises and falls with each person's own accuracy" },
  { old: "Feedback once a year, if ever", new: "Graded instantly, cue by cue" },
  { old: "Email only", new: "Email and text, judged in the same flow" },
  { old: "A slideshow you click through once", new: "A simulated inbox and message thread you practice in" },
];

export function ComparisonTable() {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      <div className="grid grid-cols-2">
        <div className="px-5 md:px-8 py-4 border-b border-r border-border bg-muted/40">
          <p className="font-display font-bold text-muted-foreground">The old way</p>
        </div>
        <div className="px-5 md:px-8 py-4 border-b border-border bg-primary/5">
          <p className="font-display font-bold text-primary">PhishAware</p>
        </div>
      </div>
      {ROWS.map((row, i) => (
        <div key={row.old} className={`grid grid-cols-2 ${i < ROWS.length - 1 ? "border-b border-border" : ""}`}>
          <div className="px-5 md:px-8 py-4 border-r border-border flex items-start gap-2.5">
            <X className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" />
            <span className="text-sm font-medium text-muted-foreground leading-snug">{row.old}</span>
          </div>
          <div className="px-5 md:px-8 py-4 flex items-start gap-2.5 bg-primary/[0.03]">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="text-sm font-semibold text-foreground leading-snug">{row.new}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
