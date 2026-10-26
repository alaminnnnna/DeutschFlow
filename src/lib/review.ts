/**
 * Spaced-repetition scheduling — a documented, pragmatic SM-2 variant.
 *
 * Ratings:  again (forgot) / hard / good / easy
 *
 *   again → repetitions reset, card returns in 10 minutes (same session),
 *           ease factor drops by 0.20
 *   hard  → interval × 1.2 (min 1 day), ease − 0.15
 *   good  → 1st success: 1 day, 2nd: 3 days, later: interval × ease
 *   easy  → 1st success: 3 days, later: interval × ease × 1.3, ease + 0.15
 *
 * ease is clamped to [1.3, 2.8]. All timestamps are epoch milliseconds;
 * "due" simply means dueAt <= now, so missing days never punish the user —
 * overdue cards are still exactly one review away from being back on track.
 */

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewState {
  /** Current interval in days (0 = learning). */
  interval: number;
  ease: number;
  repetitions: number;
  /** Epoch ms when the card becomes due (0 = new card, due immediately). */
  dueAt: number;
  lastReviewedAt: number | null;
  lapses: number;
}

export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export function newReviewState(): ReviewState {
  return {
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    dueAt: 0,
    lastReviewedAt: null,
    lapses: 0,
  };
}

function clampEase(e: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(e * 100) / 100));
}

export function schedule(prev: ReviewState, rating: Rating, now = Date.now()): ReviewState {
  let { interval, ease, repetitions, lapses } = prev;

  if (rating === 'again') {
    repetitions = 0;
    lapses += 1;
    ease = clampEase(ease - 0.2);
    return {
      interval: 0,
      ease,
      repetitions,
      dueAt: now + 10 * MINUTE,
      lastReviewedAt: now,
      lapses,
    };
  }

  if (rating === 'hard') {
    ease = clampEase(ease - 0.15);
    interval = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
  } else if (rating === 'good') {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.round(interval * ease);
  } else {
    // easy
    ease = clampEase(ease + 0.15);
    interval = repetitions === 0 ? 3 : Math.round(interval * ease * 1.3);
  }

  repetitions += 1;
  return {
    interval,
    ease,
    repetitions,
    dueAt: now + interval * DAY,
    lastReviewedAt: now,
    lapses,
  };
}

export function isDue(review: ReviewState, now = Date.now()): boolean {
  return review.dueAt <= now;
}

// ── Review history (append-only log, one record per submitted rating) ──

export interface ReviewRecord {
  /** Epoch ms when the rating was submitted. */
  at: number;
  rating: Rating;
  /** Interval (days) before this review. */
  prevInterval: number;
  /** Interval (days) this review produced. */
  newInterval: number;
  /** True for hard/good/easy — "again" is a failed recall. */
  correct: boolean;
}

/**
 * Mastery criterion — explicit and documented (never "saved = mastered"):
 * a word counts as শেখা হয়েছে when the SM-2 scheduler has promoted it to
 * at least a 7-day interval after at least 3 consecutive successful recalls.
 */
export const MASTERY_MIN_RECALLS = 3;
export const MASTERY_MIN_INTERVAL_DAYS = 7;

export type LearningState = 'new' | 'learning' | 'mastered';

export function learningState(review: ReviewState): LearningState {
  const reviewed = review.repetitions > 0 || review.lastReviewedAt !== null || review.lapses > 0;
  if (!reviewed) return 'new';
  if (review.repetitions >= MASTERY_MIN_RECALLS && review.interval >= MASTERY_MIN_INTERVAL_DAYS) {
    return 'mastered';
  }
  return 'learning';
}

export function isMastered(review: ReviewState): boolean {
  return learningState(review) === 'mastered';
}

// ── History-derived analytics (pure, testable) ────────────────────────

export interface RecallStats {
  attempts: number;
  correct: number;
  wrong: number;
  /** 0..1, null when there are no attempts yet. */
  rate: number | null;
  /** Current streak of consecutive correct ratings at the end of the log. */
  consecutiveCorrect: number;
  /** Epoch ms of the first successful recall, null before the first one. */
  firstCorrectAt: number | null;
  lastReviewedAt: number | null;
}

const EMPTY_RECALL: RecallStats = {
  attempts: 0,
  correct: 0,
  wrong: 0,
  rate: null,
  consecutiveCorrect: 0,
  firstCorrectAt: null,
  lastReviewedAt: null,
};

/** Aggregate a review log into honest per-word metrics. */
export function recallStats(history: ReviewRecord[] | undefined | null): RecallStats {
  if (!history || history.length === 0) return EMPTY_RECALL;
  let correct = 0;
  let streak = 0;
  let firstCorrectAt: number | null = null;
  let lastReviewedAt: number | null = null;
  for (const rec of history) {
    if (rec.correct) {
      correct += 1;
      streak += 1;
      if (firstCorrectAt === null) firstCorrectAt = rec.at;
    } else {
      streak = 0;
    }
    if (lastReviewedAt === null || rec.at > lastReviewedAt) lastReviewedAt = rec.at;
  }
  const attempts = history.length;
  return {
    attempts,
    correct,
    wrong: attempts - correct,
    rate: correct / attempts,
    consecutiveCorrect: streak,
    firstCorrectAt,
    lastReviewedAt,
  };
}

/**
 * A word is "difficult" when the user demonstrably struggles with it:
 * at least 3 attempts with a recall rate of 50% or worse, or 3+ lapses.
 */
export function isDifficult(
  review: ReviewState,
  history: ReviewRecord[] | undefined | null
): boolean {
  if (review.lapses >= 3) return true;
  const stats = recallStats(history);
  return stats.attempts >= 3 && stats.rate !== null && stats.rate <= 0.5;
}

/** Human-friendly due description in Bangla. */
export function dueLabel(dueAt: number, now = Date.now()): string {
  if (dueAt <= now) return 'আজকের কাতারে';
  const days = Math.ceil((dueAt - now) / DAY);
  if (days === 1) return 'আগামীকাল';
  if (days < 30) return `${days} দিন পরে`;
  const months = Math.round(days / 30);
  return `${months} মাস পরে`;
}
