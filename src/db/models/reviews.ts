import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * When a learner should next be tested on one specific thing.
 *
 * The collection was provisioned from the start with `interval`, `easeFactor`,
 * `dueAt` and `lastReviewedAt` -- a spaced-repetition schedule -- and never
 * written to. Nothing in the product remembered that somebody missed lookalike
 * domains three weeks ago, so a red flag they had never once spotted could go
 * unseen for a month while the adaptive engine happily served them things they
 * were already good at.
 *
 * One row per learner per target. A target is a red flag, a persuasion lever or
 * a channel: the three things a scenario can be *about*, so a schedule can be
 * kept against any of them.
 */
export type ReviewTargetType = "cueType" | "emotionalLever" | "vector";

export interface ReviewDoc extends SpecConventions {
  _id: ObjectId;
  reviewId: ObjectId; // named PK per the shared spec -- mirrors _id
  userId: ObjectId;
  /** Null for a self-signup learner, who still deserves a schedule. */
  orgId: ObjectId | null;
  targetType: ReviewTargetType;
  /** e.g. "sender_domain", "urgency", "qr". */
  targetValue: string;
  /** When this should next be put in front of them. */
  dueAt: Date;
  /** Days until the next review after a success. */
  interval: number;
  /**
   * How quickly the interval grows. Rises with each success and falls with each
   * miss, so something a learner keeps getting wrong keeps coming back quickly
   * and something they have genuinely learned recedes.
   */
  easeFactor: number;
  lastReviewedAt: Date | null;
  /** Consecutive successes, which is what "mastered" is counted from. */
  streak: number;
}

export type InsertReview = Omit<ReviewDoc, "_id">;

export const REVIEWS_COLLECTION = "reviews";

export function reviewsCollection() {
  return getCollection<ReviewDoc>(REVIEWS_COLLECTION);
}
