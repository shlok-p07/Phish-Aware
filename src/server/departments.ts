import { ObjectId } from "mongodb";
import { departmentsCollection, usersCollection, specDefaults } from "@/db";
import { DEPARTMENTS } from "@/lib/onboarding-survey";

/**
 * Departments as organization-owned records rather than a fixed enum.
 *
 * The ten names the product shipped with are still what a new organization
 * starts from -- they map to attack types in src/server/attackProfiles.ts, so a
 * customer who keeps them gets department-targeted scenarios for free. Anything
 * they add beyond those is honoured everywhere a department is used and simply
 * falls back to the universal attack set, which is what the generator already
 * does for a department it does not recognise.
 */

/** What a brand-new organization is seeded with. */
export const STANDARD_DEPARTMENT_NAMES: readonly string[] = DEPARTMENTS;

export const MAX_DEPARTMENT_NAME_LENGTH = 60;

/** Trimmed, collapsed whitespace. Comparison is case-insensitive. */
export function normalizeDepartmentName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Make sure this organization has department records, creating the standard set
 * the first time it is asked for.
 *
 * Idempotent, and safe to call on an organization that predates this collection:
 * any department name already sitting on a member is adopted as a record, so an
 * existing customer keeps exactly the departments they were already using rather
 * than losing them to a fixed list.
 */
export async function ensureOrgDepartments(orgId: ObjectId): Promise<void> {
  const departments = await departmentsCollection();
  const existing = await departments.find({ orgId }).toArray();
  const known = new Set(existing.map((d) => d.name.toLowerCase()));

  const users = await usersCollection();
  const members = await users.find({ orgId }).toArray();
  const inUse = members
    .map((m) => m.department)
    .filter((name): name is string => typeof name === "string" && name.trim() !== "");

  const wanted = [...STANDARD_DEPARTMENT_NAMES, ...inUse];
  const missing: string[] = [];
  for (const name of wanted) {
    const normalized = normalizeDepartmentName(name);
    if (!normalized || known.has(normalized.toLowerCase())) continue;
    known.add(normalized.toLowerCase());
    missing.push(normalized);
  }
  if (missing.length === 0) {
    return;
  }

  // Upserts keyed on (orgId, name) rather than insertMany.
  //
  // This function read the collection and then inserted what was absent, which
  // is only correct if nothing else is doing the same thing at the same time.
  // Nothing guaranteed that: listOrgDepartments calls this on every read, and
  // findOrgDepartment and isOrgDepartment both go through listOrgDepartments,
  // so one request validating a department name while another lists them was
  // enough. Two callers each saw an empty collection, each decided all ten
  // standard names were missing, and each inserted them -- leaving one
  // organisation with every department exactly twice.
  //
  // An upsert makes the second writer a no-op instead of a duplicate. The
  // unique index added alongside this is the actual guarantee; this keeps the
  // common case from having to rely on a write error.
  const now = new Date();
  const { updatedAt: _updatedAt, ...insertOnly } = specDefaults(now);
  await departments.bulkWrite(
    missing.map((name) => {
      const id = new ObjectId();
      return {
        updateOne: {
          filter: { orgId, name },
          update: {
            $set: { updatedAt: now },
            $setOnInsert: {
              ...insertOnly,
              _id: id,
              departmentId: id,
              orgId,
              name,
              parentId: null,
              managerId: null,
            },
          },
          upsert: true,
        },
      };
    }),
  );
}

/** This organization's departments, alphabetically. */
export async function listOrgDepartments(orgId: ObjectId) {
  const departments = await departmentsCollection();
  let rows = await departments.find({ orgId }).toArray();
  // Seed only when there is genuinely nothing, rather than on every read. The
  // unconditional call meant every list, every name validation and every
  // membership check re-derived the standard set and re-checked the whole member
  // list -- a write path on a read, and the thing that made the duplicate race
  // easy to hit.
  if (rows.length === 0) {
    await ensureOrgDepartments(orgId);
    rows = await departments.find({ orgId }).toArray();
  }
  // Deduplicated on the way out as well as prevented on the way in. The unique
  // index is the real guarantee, but it is created tolerantly -- an existing
  // cluster may still hold duplicates from before it existed -- and every
  // department dropdown renders straight from this list with the name as the
  // option value. Two options sharing a value is an ambiguous selection, so a
  // stale row would break the control rather than just look untidy.
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The department record matching `name` in this organization, or null.
 *
 * Case-insensitive, because "finance" typed into an invite form and "Finance"
 * on the record are the same department to everyone except a string compare.
 */
export async function findOrgDepartment(orgId: ObjectId, name: string) {
  const normalized = normalizeDepartmentName(name).toLowerCase();
  if (!normalized) return null;
  const rows = await listOrgDepartments(orgId);
  return rows.find((d) => d.name.toLowerCase() === normalized) ?? null;
}

/**
 * Validation for anything that accepts a department name from a client.
 *
 * Replaces the fixed-enum check that used to guard these paths. That check is
 * what made custom departments impossible: it rejected any name the product had
 * not shipped with, whatever the customer had configured.
 */
export async function isOrgDepartment(orgId: ObjectId, name: string): Promise<boolean> {
  return (await findOrgDepartment(orgId, name)) !== null;
}
