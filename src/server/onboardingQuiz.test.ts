import { describe, expect, it } from "bun:test";
import {
  ONBOARDING_QUIZ_LENGTH,
  selectQuizScenarios,
  type SelectableScenario,
} from "./onboardingQuiz";

/** A deterministic stand-in for Math.random, cycling the values given. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/** Identity shuffle: Fisher-Yates with random()=0 maps each i to j=0... */
const noShuffle = () => 0;

function scenario(
  vector: string,
  sender: string,
  subject: string,
  body = "",
): SelectableScenario {
  return { vector, sender, subject, body };
}

/** The exact shape the live collection was in: five questions, each twice. */
const DUPLICATED_SEED: SelectableScenario[] = [
  scenario("email", "IT Support <helpdesk@corp-secure-mail.net>", "Action Required"),
  scenario("email", "The Daily Brew <news@dailybrew.com>", "You're subscribed!"),
  scenario("email", "Alex Chen (CEO) <alex.chen@corp-exec-office.com>", "Quick favor"),
  scenario("email", "Northline Bank <notifications@northlinebank.com>", "Your statement"),
  scenario("email", "Rewards Center <winner@prizes-notify.info>", "Congratulations!"),
  // The pre-`source` copies the content-matched upsert could not see.
  scenario("email", "IT Support <helpdesk@corp-secure-mail.net>", "Action Required"),
  scenario("email", "The Daily Brew <news@dailybrew.com>", "You're subscribed!"),
  scenario("email", "Alex Chen (CEO) <alex.chen@corp-exec-office.com>", "Quick favor"),
  scenario("email", "Northline Bank <notifications@northlinebank.com>", "Your statement"),
  scenario("email", "Rewards Center <winner@prizes-notify.info>", "Congratulations!"),
];

describe("selectQuizScenarios", () => {
  it("serves five distinct questions from the duplicated collection", () => {
    // The regression this exists for: the route returned all ten, and the
    // onboarding page sizes itself off the response, so learners saw
    // "Question 1 of 10" and answered each scenario twice.
    const picked = selectQuizScenarios(DUPLICATED_SEED, noShuffle);

    expect(picked).toHaveLength(5);
    const keys = picked.map((s) => `${s.vector}|${s.sender}|${s.subject}`);
    expect(new Set(keys).size).toBe(5);
  });

  it("never exceeds the length the API contract promises", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      scenario("email", `sender-${i}`, `subject-${i}`),
    );
    expect(selectQuizScenarios(many, noShuffle)).toHaveLength(ONBOARDING_QUIZ_LENGTH);
  });

  it("returns a short quiz rather than padding with repeats", () => {
    // Two distinct questions duplicated four times over is still two
    // questions. Padding to five would mean showing one twice.
    const thin = [
      scenario("email", "a@example.test", "one"),
      scenario("email", "b@example.test", "two"),
      scenario("email", "a@example.test", "one"),
      scenario("email", "b@example.test", "two"),
    ];
    expect(selectQuizScenarios(thin, noShuffle)).toHaveLength(2);
  });

  it("treats the same sender and subject on different vectors as different questions", () => {
    const crossVector = [
      scenario("email", "IT Support", "Password expiring", "Reset it today."),
      scenario("sms", "IT Support", "Password expiring", "Reset it today."),
      scenario("voice", "IT Support", "Password expiring", "Reset it today."),
    ];
    // A password-expiry pretext reads completely differently as a text message
    // or a phone call, so collapsing these would lose real coverage.
    expect(selectQuizScenarios(crossVector, noShuffle)).toHaveLength(3);
  });

  it("varies the order between runs, so a cohort is not measured on one fixed sequence", () => {
    const distinct = Array.from({ length: 5 }, (_, i) =>
      scenario("email", `sender-${i}`, `subject-${i}`),
    );
    const order = (r: () => number) =>
      selectQuizScenarios(distinct, r).map((s) => s.sender).join(",");

    // Two different random streams must not produce the same sequence; if the
    // shuffle were a no-op every learner would get an identical quiz.
    expect(order(sequence([0.99, 0.01, 0.75, 0.2]))).not.toBe(
      order(sequence([0.1, 0.9, 0.3, 0.8])),
    );
  });

  it("is a genuine permutation -- it never drops or invents a question", () => {
    const distinct = Array.from({ length: 5 }, (_, i) =>
      scenario("email", `sender-${i}`, `subject-${i}`),
    );
    const picked = selectQuizScenarios(distinct, sequence([0.37, 0.81, 0.04, 0.63, 0.5]));
    expect(new Set(picked.map((s) => s.sender))).toEqual(
      new Set(distinct.map((s) => s.sender)),
    );
  });

  it("handles an empty collection without throwing", () => {
    // Reachable on a database that has never been seeded; the onboarding page
    // already renders its own empty state for this.
    expect(selectQuizScenarios([], noShuffle)).toEqual([]);
  });
});

describe("content key", () => {
  it("keeps two different texts from the same number apart", () => {
    // sms and voice scenarios carry no subject, so a key built only from
    // vector + sender + subject collapsed every message from one number into
    // a single question. These are two distinct pretexts.
    const sameNumber = [
      { vector: "sms", sender: "+1 (650) 123-4567", subject: "", body: "Your parcel is held." },
      { vector: "sms", sender: "+1 (650) 123-4567", subject: "", body: "Your bank card is locked." },
    ];
    expect(selectQuizScenarios(sameNumber, noShuffle)).toHaveLength(2);
  });

  it("still collapses a genuinely identical row", () => {
    const identical = [
      { vector: "sms", sender: "+1 (650) 123-4567", subject: "", body: "Your parcel is held." },
      { vector: "sms", sender: "+1 (650) 123-4567", subject: "", body: "Your parcel is held." },
    ];
    expect(selectQuizScenarios(identical, noShuffle)).toHaveLength(1);
  });
});
