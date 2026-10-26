/**
 * Honest activity statistics — only real, user-generated events are counted:
 *   - listens: every successful Listen Now flow
 *   - reviews: every vocabulary card rated in Review
 *
 * Aggregated per local calendar day in the IDB kv store. No fabricated
 * streaks, minutes or scores — the Progress view renders exactly these
 * counters and nothing else.
 */

import { kvGet, kvSet } from './storage/idb';

const STATS_KEY = 'deutschflow.stats.v1';

export interface DayStat {
  listens: number;
  reviews: number;
}

export interface StatsMap {
  byDay: Record<string, DayStat>;
}

export function emptyStats(): StatsMap {
  return { byDay: {} };
}

/** Local calendar-day key, e.g. 2026-10-27. */
export function dayKey(now = new Date()): string {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function getStats(): Promise<StatsMap> {
  return (await kvGet<StatsMap>(STATS_KEY)) ?? emptyStats();
}

async function bump(field: keyof DayStat, now = new Date()): Promise<void> {
  const stats = await getStats();
  const key = dayKey(now);
  const day = stats.byDay[key] ?? { listens: 0, reviews: 0 };
  day[field] += 1;
  stats.byDay[key] = day;
  // Keep the map bounded: drop days older than 120 days.
  const cutoff = Date.now() - 120 * 86_400_000;
  for (const k of Object.keys(stats.byDay)) {
    if (new Date(`${k}T00:00:00`).getTime() < cutoff) delete stats.byDay[k];
  }
  await kvSet(STATS_KEY, stats);
}

export async function recordListen(): Promise<void> {
  await bump('listens');
}

export async function recordReview(): Promise<void> {
  await bump('reviews');
}

/** Consecutive local days (ending today or yesterday) with any activity. */
export function computeStreak(stats: StatsMap, now = new Date()): number {
  let streak = 0;
  const cursor = new Date(now);
  // A streak survives "yesterday had activity, today not yet".
  if (!active(stats, cursor)) cursor.setDate(cursor.getDate() - 1);
  while (active(stats, cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function active(stats: StatsMap, d: Date): boolean {
  const s = stats.byDay[dayKey(d)];
  return !!s && (s.listens > 0 || s.reviews > 0);
}

/** Last N local days (oldest → newest) for the activity bar. */
export function lastNDays(stats: StatsMap, n: number, now = new Date()): Array<{ label: string; stat: DayStat }> {
  const out: Array<{ label: string; stat: DayStat }> = [];
  const cursor = new Date(now);
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i += 1) {
    out.push({
      label: dayKey(cursor).slice(5),
      stat: stats.byDay[dayKey(cursor)] ?? { listens: 0, reviews: 0 },
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
