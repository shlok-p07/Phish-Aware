import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { PRACTICE_VECTORS } from "./attackProfiles";

/**
 * The vector list is declared in four places that cannot import each other: the
 * TypeScript source of truth, the generator's per-vector prompt brief, the
 * MongoDB validator, and the OpenAPI contract. Drift between them fails in ways
 * nothing else catches -- a vector the API accepts but the generator cannot
 * write produces a 404 on a live request, and one the validator rejects fails
 * only at insert time, in the background top-up, where nobody sees it.
 */
describe("vector taxonomy stays in sync", () => {
  it("the generator has a prompt brief for every practisable vector", () => {
    const src = readFileSync("src/server/scenarioGenerator.ts", "utf8");
    const block = src.slice(src.indexOf("const VECTOR_BRIEF"));
    for (const vector of PRACTICE_VECTORS) {
      // A vector with no brief is a TypeScript error today, but the Record is
      // what makes that true -- if it ever widens to Partial this still holds.
      expect(block).toContain(`  ${vector}: {`);
    }
  });

  it("the collection validator accepts every practisable vector", () => {
    const src = readFileSync("src/db/provision.ts", "utf8");
    const line = src.split("\n").find((l) => l.includes("const VECTOR ="));
    expect(line).toBeDefined();
    for (const vector of PRACTICE_VECTORS) {
      expect(line).toContain(`"${vector}"`);
    }
  });

  it("the OpenAPI contract exposes every practisable vector, plus mixed", () => {
    const spec = readFileSync("src/api-spec/openapi.yaml", "utf8");
    const filter = spec.split("\n").find((l) => l.includes("enum: [email") && l.includes("mixed"));
    expect(filter).toBeDefined();
    for (const vector of PRACTICE_VECTORS) {
      expect(filter).toContain(vector);
    }
  });

  it("the scenario vector enum in the contract matches exactly", () => {
    const spec = readFileSync("src/api-spec/openapi.yaml", "utf8");
    const line = spec
      .split("\n")
      .find((l) => l.includes("enum: [email") && !l.includes("mixed"));
    expect(line).toBeDefined();
    const declared = line!
      .slice(line!.indexOf("[") + 1, line!.lastIndexOf("]"))
      .split(",")
      .map((v) => v.trim());
    expect(declared.sort()).toEqual([...PRACTICE_VECTORS].sort());
  });
});
