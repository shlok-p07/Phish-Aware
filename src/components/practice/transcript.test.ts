import { describe, it, expect } from "bun:test";
import { formatDuration, parseTranscript, splitWords, wordIndexAt } from "./transcript";

describe("parseTranscript", () => {
  it("splits a stored body into lines and strips the Caller prefix", () => {
    const body = "Caller: We detected unusual activity.\nCaller: Confirm your PIN now.";
    expect(parseTranscript(body)).toEqual([
      { text: "We detected unusual activity." },
      { text: "Confirm your PIN now." },
    ]);
  });

  it("drops blank lines rather than speaking silence", () => {
    expect(parseTranscript("Caller: One.\n\n   \nCaller: Two.")).toEqual([
      { text: "One." },
      { text: "Two." },
    ]);
  });

  it("handles a body with no prefixes at all", () => {
    expect(parseTranscript("Just a sentence.")).toEqual([{ text: "Just a sentence." }]);
  });

  it("drops a line that is nothing but a prefix", () => {
    expect(parseTranscript("Caller:\nCaller: Real line.")).toEqual([{ text: "Real line." }]);
  });
});

describe("splitWords", () => {
  it("reports each word with its character range", () => {
    expect(splitWords("Confirm your PIN")).toEqual([
      { text: "Confirm", start: 0, end: 7 },
      { text: "your", start: 8, end: 12 },
      { text: "PIN", start: 13, end: 16 },
    ]);
  });

  it("returns nothing for an empty line", () => {
    expect(splitWords("")).toEqual([]);
  });
});

describe("wordIndexAt", () => {
  const words = splitWords("Confirm your PIN");

  it("finds the word at the start of its range", () => {
    expect(wordIndexAt(words, 8)).toBe(1);
  });

  // Browsers disagree on whether charIndex lands on the word start or inside
  // it, so an offset mid-word has to resolve to that same word.
  it("finds the word from an offset inside it", () => {
    expect(wordIndexAt(words, 10)).toBe(1);
  });

  it("clamps to the last word past the end of the line", () => {
    expect(wordIndexAt(words, 99)).toBe(2);
  });

  it("returns -1 for a negative offset", () => {
    expect(wordIndexAt(words, -1)).toBe(-1);
  });

  it("returns -1 when there are no words", () => {
    expect(wordIndexAt([], 0)).toBe(-1);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "00:00"],
    [9, "00:09"],
    [65, "01:05"],
    [600, "10:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds as number)).toBe(expected);
  });

  it("never renders a negative clock", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});
