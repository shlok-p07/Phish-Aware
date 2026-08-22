
/**
 * A training campaign's audience, encoded as the single `target` string the
 * campaign document stores and the admin UI round-trips through a <Select>.
 *
 * Encoding it in one place keeps the server and the form from disagreeing about
 * what "department:Finance" means -- a mismatch there would silently assign a
 * campaign to nobody, which looks like success right up until the deadline.
 */
export const DEPARTMENT_TARGET_PREFIX = "department:";

export type TrainingTarget =
  | { kind: "all" }
  | { kind: "department"; department: string }
  | { kind: "member"; memberId: string };

export function encodeDepartmentTarget(department: string): string {
  return `${DEPARTMENT_TARGET_PREFIX}${department}`;
}

/**
 * Decodes only. Whether the named department exists is a question about one
 * organization's records, which this cannot answer -- it is shared with the
 * browser and has no database. The route checks it against the caller's own
 * departments; this used to check a fixed enum, which is what made a customer's
 * own department names unusable as a training target.
 */
export function parseTrainingTarget(target: string): TrainingTarget | null {
  if (target === "all") {
    return { kind: "all" };
  }
  if (target.startsWith(DEPARTMENT_TARGET_PREFIX)) {
    const department = target.slice(DEPARTMENT_TARGET_PREFIX.length).trim();
    return department ? { kind: "department", department } : null;
  }
  return target ? { kind: "member", memberId: target } : null;
}

/**
 * How a stored target reads in the UI. `memberName` resolves a user id; it
 * returns null when the member is gone, in which case the campaign still has to
 * render as something.
 */
export function describeTrainingTarget(
  target: string,
  memberName: (id: string) => string | null,
): string {
  const parsed = parseTrainingTarget(target);
  if (!parsed) return "Unknown";
  switch (parsed.kind) {
    case "all":
      return "Everyone";
    case "department":
      return `${parsed.department} department`;
    case "member":
      return memberName(parsed.memberId) ?? "Unknown";
  }
}
