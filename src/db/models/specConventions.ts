/**
 * Fields every collection in the shared database schema spec carries
 * (see src/db/provision.ts's `make()` helper): a generic
 * extension bag, and standard timestamps with soft-delete. Not applied to
 * `sessions`, which is app-internal and not part of the shared spec.
 */
export interface SpecConventions {
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function specDefaults(now: Date = new Date()): SpecConventions {
  return { metadata: {}, createdAt: now, updatedAt: now, deletedAt: null };
}
