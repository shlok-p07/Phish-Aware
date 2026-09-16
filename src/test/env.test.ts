import { afterEach, describe, expect, it } from "bun:test";
import { captureEnv, restoreEnv, setEnv } from "./env";

const KEY = "PHISHAWARE_ENV_HELPER_PROBE";
const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  delete env[KEY];
});

describe("restoreEnv", () => {
  it("unsets the key when the captured value was undefined", () => {
    delete env[KEY];
    const original = captureEnv(KEY);
    env[KEY] = "https://hooks.example.test/set-during-a-test";

    restoreEnv(KEY, original);

    // The bare assignment this exists to replace would leave the string
    // "undefined" here, which is truthy and non-blank -- a value every later
    // test file in the process would read as real configuration.
    expect(KEY in env).toBe(false);
    expect(env[KEY]).toBeUndefined();
  });

  it("is not the same as assigning undefined, which is the whole point", () => {
    delete env[KEY];
    env[KEY] = undefined as unknown as string;

    // Documents the platform behaviour the helper works around.
    expect(env[KEY]).toBe("undefined");
    expect(Boolean(env[KEY]?.trim())).toBe(true);
  });

  it("puts a real captured value back", () => {
    env[KEY] = "original";
    const original = captureEnv(KEY);
    env[KEY] = "temporary";

    restoreEnv(KEY, original);

    expect(env[KEY]).toBe("original");
  });

  it("setEnv unsets on undefined and assigns otherwise", () => {
    setEnv(KEY, "value");
    expect(env[KEY]).toBe("value");
    setEnv(KEY, undefined);
    expect(KEY in env).toBe(false);
  });
});
