import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ORG_OWNED_COLLECTIONS,
  UNOWNED_COLLECTIONS,
  USER_OWNED_COLLECTIONS,
} from "./ownedData";

/**
 * Parity between what gets provisioned and what gets cleaned up.
 *
 * This exists because the same bug happened three times. Account deletion left
 * assignments behind until somebody noticed; then reviews, lessonCompletions,
 * surveyResponses and consents were added and none of them were removed either,
 * while the function's docstring and the button in the UI both promised all of
 * the user's data. Organisation deletion drifted the same way and left its
 * departments, invitations and SSO connection pointing at a tenant that no
 * longer existed.
 *
 * Rather than a fourth hand-written list to forget, this reads provision.ts --
 * the definitive list, since a collection that is not provisioned does not
 * exist -- and works out from each validator whether it carries an owner. Adding
 * a collection with a userId or orgId now fails here until a decision is
 * recorded in ownedData.ts.
 */
const SOURCE = readFileSync("src/db/provision.ts", "utf8");

interface Provisioned {
  name: string;
  hasUserId: boolean;
  hasOrgId: boolean;
}

/** Every `make(db, "name", [...], { ...properties })` block in provisioning. */
function provisionedCollections(): Provisioned[] {
  const out: Provisioned[] = [];
  const pattern = /await make\(\s*db,\s*"([a-zA-Z]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(SOURCE)) !== null) {
    const name = match[1]!;
    // The properties object runs from this call to the line that closes it.
    const start = match.index;
    const end = SOURCE.indexOf("\n  });", start);
    const block = SOURCE.slice(start, end === -1 ? undefined : end);
    out.push({
      name,
      hasUserId: /\buserId:/.test(block),
      hasOrgId: /\borgId:/.test(block),
    });
  }
  return out;
}

const PROVISIONED = provisionedCollections();

describe("provisioning parity", () => {
  it("finds the provisioned collections", () => {
    // Guards the parser: a regex that silently matches nothing would make every
    // assertion below pass for the wrong reason.
    expect(PROVISIONED.length).toBeGreaterThan(12);
    expect(PROVISIONED.map((c) => c.name)).toContain("users");
    expect(PROVISIONED.map((c) => c.name)).toContain("attempts");
  });

  it("detects owner fields on the validators", () => {
    const attempts = PROVISIONED.find((c) => c.name === "attempts")!;
    expect(attempts.hasUserId).toBe(true);
    const organizations = PROVISIONED.find((c) => c.name === "organizations")!;
    expect(organizations.hasUserId).toBe(false);
    expect(organizations.hasOrgId).toBe(false);
  });

  it("accounts for every collection that carries an owner", () => {
    const accounted = new Set<string>([
      ...USER_OWNED_COLLECTIONS,
      ...ORG_OWNED_COLLECTIONS,
      ...UNOWNED_COLLECTIONS,
    ]);
    const unaccounted = PROVISIONED.filter(
      (c) => (c.hasUserId || c.hasOrgId) && !accounted.has(c.name),
    ).map((c) => c.name);

    // If this fails, a collection was added without deciding whether its rows
    // die with the user, with the organisation, or neither. Record the decision
    // in src/server/ownedData.ts.
    expect(unaccounted).toEqual([]);
  });

  it("cleans up every collection it claims a user owns", () => {
    // The reverse direction: a name in the list that is not provisioned is a
    // deleteMany against a collection that does not exist, which is a silent
    // no-op rather than an error.
    const provisioned = new Set(PROVISIONED.map((c) => c.name));
    for (const name of USER_OWNED_COLLECTIONS) {
      expect(provisioned.has(name)).toBe(true);
    }
  });

  it("cleans up every collection it claims an organisation owns", () => {
    const provisioned = new Set(PROVISIONED.map((c) => c.name));
    for (const name of ORG_OWNED_COLLECTIONS) {
      expect(provisioned.has(name)).toBe(true);
    }
  });

  it("only exempts collections that really are provisioned", () => {
    const provisioned = new Set(PROVISIONED.map((c) => c.name));
    for (const name of UNOWNED_COLLECTIONS) {
      expect(provisioned.has(name)).toBe(true);
    }
  });

  it("does not list the same collection as owned by both", () => {
    // assignments legitimately carries both ids and is cleaned by either path,
    // so overlap between the user and org lists is allowed -- but a collection
    // must never be both owned and exempt.
    const owned = new Set<string>([...USER_OWNED_COLLECTIONS, ...ORG_OWNED_COLLECTIONS]);
    const contradictions = UNOWNED_COLLECTIONS.filter((name) => owned.has(name));
    expect(contradictions).toEqual([]);
  });
});
