import { mock } from "bun:test";

/**
 * Fakes just usersCollection() from "@/db" for route-level tests, while
 * passing every other real export straight through -- so any other test file
 * that also touches "@/db" (directly or via something it imports) doesn't
 * lose access to collections this file never fakes. Bun's mock.module is
 * process-global and replaces a module's exports outright, so spreading the
 * real module first (captured before this mock installs) is what keeps that
 * safe, the same idea as src/test/mock-api-client.ts uses for "@/api-client".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ObjectId's real equals() signature is narrower than any generic doc-shape can declare structurally.
type FakeDoc = { _id: { toString(): string; equals?: (other: any) => boolean } } & Record<string, unknown>;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a && typeof (a as { equals?: unknown }).equals === "function") {
    return (a as { equals: (other: unknown) => boolean }).equals(b);
  }
  return a === b;
}

function matches(doc: FakeDoc, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, condition]) => {
    if (condition && typeof condition === "object" && "$ne" in condition) {
      return !valuesEqual(doc[key], (condition as { $ne: unknown }).$ne);
    }
    return valuesEqual(doc[key], condition);
  });
}

/** Shared, mutable seed data -- tests push/reset docs here directly. */
export const fakeUsersState = {
  docs: [] as FakeDoc[],
};

export function resetFakeUsersState() {
  fakeUsersState.docs = [];
}

function fakeUsersCollection() {
  return {
    find: (query: Record<string, unknown>) => ({
      toArray: async () => fakeUsersState.docs.filter((d) => matches(d, query)),
    }),
    updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
      const doc = fakeUsersState.docs.find((d) => matches(d, filter));
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
    },
  };
}

let installed = false;

/** Idempotent -- safe to call from every test file that needs "@/db" mocked this way. */
export async function installUsersCollectionMock() {
  if (installed) return;
  installed = true;
  const realDb = await import("@/db");
  mock.module("@/db", () => ({
    ...realDb,
    usersCollection: fakeUsersCollection,
  }));
}
