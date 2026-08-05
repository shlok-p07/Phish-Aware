import { cn } from "@/lib/utils";

/**
 * The measure each page is laid out against. <main> deliberately doesn't cap
 * width, so this is the single place a page's width is decided -- previously
 * every page hand-rolled `max-w-* mx-auto` inside an already-capped <main>,
 * which made half of them no-ops and the rest inconsistent.
 */
const WIDTHS = {
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

export type PageWidth = keyof typeof WIDTHS;

export function PageShell({
  width = "5xl",
  className,
  children,
}: {
  width?: PageWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The one page title treatment. `actions` sits to the right on wide screens and
 * wraps underneath on narrow ones. Always renders an <h1>, so every page has
 * exactly one and heading order starts correctly.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="inline-flex shrink-0 rounded-lg bg-primary/10 p-2 text-primary" aria-hidden>
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground font-medium text-pretty">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
