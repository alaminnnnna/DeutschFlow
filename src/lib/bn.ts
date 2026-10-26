/**
 * Bengali numeral + date formatting helpers.
 *
 * The Vocabulary dashboard presents counts the way Bengali readers expect
 * (১২৪টি শব্দ · ১৮টি রিভিউ বাকি). All helpers are pure and SSR-safe: they
 * never depend on the DOM and fall back to plain digits when Intl lacks the
 * Bengali calendar data (rare, e.g. old Node during tests).
 */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** 124 → "১২৪" (string input allowed so decimals pass through untouched). */
export function bnNum(value: number | string): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/** 0.714 → "৭১.৪%" · 1 → "১০০%" · trailing ".0" is dropped. */
export function bnPct(fraction: number): string {
  const pct = (fraction * 100).toFixed(1).replace(/\.0$/, '');
  return `${bnNum(pct)}%`;
}

let bnDateFmt: Intl.DateTimeFormat | null = null;
let bnDateTimeFmt: Intl.DateTimeFormat | null = null;

function getFormatters(): { date: Intl.DateTimeFormat | null; dateTime: Intl.DateTimeFormat | null } {
  try {
    if (!bnDateFmt) {
      bnDateFmt = new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short' });
    }
    if (!bnDateTimeFmt) {
      bnDateTimeFmt = new Intl.DateTimeFormat('bn-BD', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return { date: bnDateFmt, dateTime: bnDateTimeFmt };
  } catch {
    return { date: null, dateTime: null };
  }
}

/** Epoch ms → "২৭ অক্টো" (short Bengali date). */
export function bnDate(ts: number): string {
  const { date } = getFormatters();
  if (!date) return new Date(ts).toISOString().slice(5, 10);
  try {
    return date.format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(5, 10);
  }
}

/** Epoch ms → "২৭ অক্টো, দুপুর ২:৩০" (Bengali date + time). */
export function bnDateTime(ts: number): string {
  const { dateTime } = getFormatters();
  if (!dateTime) return new Date(ts).toLocaleString();
  try {
    return dateTime.format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}
