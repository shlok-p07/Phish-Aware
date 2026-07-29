import { ObjectId } from "mongodb";

export function isValidObjectIdHex(id: string): boolean {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

/** Returns null instead of throwing on malformed input, so routes can turn it into a clean 400/404. */
export function toObjectId(id: string): ObjectId | null {
  return isValidObjectIdHex(id) ? new ObjectId(id) : null;
}
