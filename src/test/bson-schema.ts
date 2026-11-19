/**
 * Checks a document against a MongoDB `$jsonSchema` validator, in-process.
 *
 * Covers the keywords src/db/provision.ts uses: bsonType, required,
 * properties, enum, minimum, maximum and items. Any other keyword throws, so
 * the day a validator gains one this fails loudly instead of quietly passing
 * documents it never checked.
 *
 * Returns the list of problems, empty when the document is valid.
 */
import { ObjectId } from "mongodb";

type Schema = Record<string, unknown>;

const SUPPORTED = new Set(["bsonType", "required", "properties", "enum", "minimum", "maximum", "items"]);

function bsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof ObjectId) return "objectId";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "double";
  if (typeof value === "object") return "object";
  return typeof value;
}

function matchesType(value: unknown, wanted: string): boolean {
  const actual = bsonTypeOf(value);
  if (actual === wanted) return true;
  // A JS integer is stored as whichever numeric type the validator allows.
  return actual === "int" && (wanted === "long" || wanted === "double");
}

export function checkBsonSchema(value: unknown, schema: Schema, path = "$"): string[] {
  const unknown = Object.keys(schema).filter((k) => !SUPPORTED.has(k));
  if (unknown.length > 0) {
    throw new Error(`checkBsonSchema does not implement ${unknown.join(", ")} (at ${path})`);
  }
  const problems: string[] = [];

  if (schema.bsonType !== undefined) {
    const types = ([] as string[]).concat(schema.bsonType as string | string[]);
    if (!types.some((t) => matchesType(value, t))) {
      return [`${path}: expected ${types.join("|")}, got ${bsonTypeOf(value)}`];
    }
  }
  if (schema.enum !== undefined && !(schema.enum as unknown[]).includes(value)) {
    problems.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      problems.push(`${path}: ${value} is below ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      problems.push(`${path}: ${value} is above ${schema.maximum}`);
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => problems.push(...checkBsonSchema(item, schema.items as Schema, `${path}[${i}]`)));
  }
  if (bsonTypeOf(value) === "object") {
    const doc = value as Record<string, unknown>;
    for (const field of (schema.required as string[] | undefined) ?? []) {
      if (!(field in doc)) problems.push(`${path}.${field}: required`);
    }
    for (const [field, fieldSchema] of Object.entries((schema.properties as Record<string, Schema>) ?? {})) {
      if (field in doc) problems.push(...checkBsonSchema(doc[field], fieldSchema, `${path}.${field}`));
    }
  }
  return problems;
}
