"use client";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Failure state for a page or panel whose data didn't load. Replaces the
 * "Failed to load X. Try refreshing." card that used to be copy-pasted into
 * every page -- and unlike that card, it offers an actual retry, since every
 * caller already has a react-query `refetch` to hand.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card className={cn("border-destructive/30 bg-destructive/5", className)}>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="inline-flex rounded-lg bg-destructive/10 p-2.5 text-destructive" aria-hidden>
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground font-medium">{description}</p>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="font-semibold">
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Nothing-here state. Thin wrapper over the ui/empty primitive so callers get a
 * consistent icon treatment and an optional way out, rather than the bare
 * one-line sentences these places used to render.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon aria-hidden />
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/* --------------------------------------------------------------------------
 * Loading skeletons.
 *
 * These mirror the real layout's shapes and spacing so content doesn't jump
 * when it arrives. Composed per page rather than one generic blob, which is
 * what the previous hand-rolled `animate-pulse` divs were each guessing at.
 * ----------------------------------------------------------------------- */

export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {actions && <Skeleton className="h-9 w-36 shrink-0" />}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 4,
  columns = 2,
  className,
}: {
  count?: number;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:gap-6", columns === 2 && "sm:grid-cols-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
