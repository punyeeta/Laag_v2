// Display helpers for dates and times. Dates are stored as YYYY-MM-DD.
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const wd = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' });
const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

/** "Tue–Wed, Dec 29–30, 2026" or "Mar 25–27, 2027" without weekdays. */
export function dateRange(start: string, end: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  const { weekday = true, year = true } = opts;
  const a = parse(start);
  const b = parse(end || start);
  const y = year ? `, ${b.getFullYear()}` : '';
  const days =
    a.getMonth() === b.getMonth()
      ? a.getDate() === b.getDate()
        ? `${mon(a)} ${a.getDate()}`
        : `${mon(a)} ${a.getDate()}–${b.getDate()}`
      : `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}`;
  if (!weekday) return days + y;
  const w = start === end || !end ? wd(a) : `${wd(a)}–${wd(b)}`;
  return `${w}, ${days}${y}`;
}

/** "Tue, Dec 29" */
export function dayLabel(iso: string) {
  const d = parse(iso);
  return `${wd(d)}, ${mon(d)} ${d.getDate()}`;
}

/** "Nov 18" */
export function shortDate(iso: string) {
  const d = parse(iso);
  return `${mon(d)} ${d.getDate()}`;
}

/** "7:30 AM" from "07:30" */
export function timeLabel(hhmm: string) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-12-29" + 3 → "2027-01-01" */
export function addDays(iso: string, n: number) {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/**
 * Days to move a past trip forward by whole years so it starts on or after
 * today (Aug 4, 2026 → Aug 4, 2027). 0 when it's already upcoming.
 */
export function shiftToUpcoming(startISO: string, todayISO: string) {
  if (startISO >= todayISO) return 0;
  const d = parse(startISO);
  while (toISO(d) < todayISO) d.setFullYear(d.getFullYear() + 1);
  return daysBetween(startISO, toISO(d));
}

export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((parse(toISO).getTime() - parse(fromISO).getTime()) / 86_400_000);
}

/** "10 minutes ago", "3 days ago", or "Nov 12" when older than a week. */
export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d <= 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function agoBucket(ts: number, now = Date.now()): 'Today' | 'This week' | 'Earlier' {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (ts >= startOfToday.getTime()) return 'Today';
  if (now - ts < 7 * 86_400_000) return 'This week';
  return 'Earlier';
}
