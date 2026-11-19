import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordProvisioning, renderIndexes, renderValidators } from "./mongoshExport";

const INIT = join(import.meta.dirname, "..", "..", "database", "init");
const committed = (file: string) => readFileSync(join(INIT, file), "utf8");

describe("database/init mongosh scripts", () => {
  // The two copies of the schema drifted for months because nothing compared
  // them. If this fails, run `bun run db:export-schema` and commit the result.
  it("01-validators.js matches provision.ts", async () => {
    expect(committed("01-validators.js")).toBe(renderValidators(await recordProvisioning()));
  });

  it("02-indexes.js matches provision.ts", async () => {
    expect(committed("02-indexes.js")).toBe(renderIndexes(await recordProvisioning()));
  });

  it("records every collection the app provisions, once", async () => {
    const names = (await recordProvisioning()).collections.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("lessonCompletions");
    expect(names).not.toContain("profiles");
  });
});
