import { describe, it, expect } from "bun:test";
import { ObjectId } from "mongodb";
import { toObjectId, isValidObjectIdHex } from "./objectId";

describe("isValidObjectIdHex", () => {
  it("accepts a valid 24-char hex ObjectId string", () => {
    expect(isValidObjectIdHex(new ObjectId().toString())).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidObjectIdHex("")).toBe(false);
  });

  it("rejects a string of the wrong length", () => {
    expect(isValidObjectIdHex("abc123")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidObjectIdHex("zzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });
});

describe("toObjectId", () => {
  it("returns an ObjectId for valid hex input", () => {
    const id = new ObjectId();
    expect(toObjectId(id.toString())?.equals(id)).toBe(true);
  });

  it("returns null instead of throwing on malformed input", () => {
    expect(toObjectId("not-an-id")).toBeNull();
    expect(toObjectId("")).toBeNull();
  });
});
