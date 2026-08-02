/**
 * Time/day mirror window logic.
 *
 * A source calendar can be configured to only mirror events that overlap a
 * user-defined day-of-week + time-of-day window. If mirror_window is null,
 * the source mirrors 24/7 (default behavior).
 *
 * Shape:
 *   {
 *     "days": [1,2,3,4,5],       // 0=Sunday, 6=Saturday
 *     "start_min": 540,          // minutes-since-midnight (9am = 540)
 *     "end_min": 1020,           // 5pm = 1020
 *     "tz": "America/Chicago"    // IANA tz name (optional; falls back to event tz)
 *   }
 *
 * Overlap rule: an event mirrors if any part of it falls inside the window
 * on any of the allowed days. Multi-day events mirror if any of their days
 * are allowed. All-day events use the day-of-week rule only (time ignored).
 */

export interface MirrorWindow {
  days?: number[];
  start_min?: number;
  end_min?: number;
  tz?: string;
}

export interface EventTimeRange {
  /** ISO string, undefined for all-day events */
  startDateTime?: string;
  endDateTime?: string;
  /** YYYY-MM-DD, present only for all-day events */
  startDate?: string;
  endDate?: string;
  /** IANA tz. Take from the Google event's start.timeZone or user's window.tz. */
  timeZone?: string;
}

/**
 * Return true if the event should be mirrored given the window.
 * Null/undefined window → always mirror (default 24/7).
 */
export function eventOverlapsWindow(event: EventTimeRange, window: MirrorWindow | null | undefined): boolean {
  if (!window || !window.days || window.days.length === 0) return true;

  const tz = window.tz || event.timeZone || 'UTC';

  // All-day events: check day-of-week only, ignore time
  if (event.startDate) {
    const start = new Date(event.startDate + 'T00:00:00');
    const end = event.endDate ? new Date(event.endDate + 'T00:00:00') : start;
    // Iterate each day in the range; mirror if any day is allowed.
    for (let d = new Date(start); d < end || d.getTime() === start.getTime(); d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (window.days.includes(dow)) return true;
      if (d.getTime() === end.getTime()) break;
    }
    return false;
  }

  // Timed event: check both day-of-week AND time-of-day overlap
  if (!event.startDateTime || !event.endDateTime) return true; // malformed → mirror to be safe

  const startAt = new Date(event.startDateTime);
  const endAt = new Date(event.endDateTime);

  // Compute the event's local time-of-day using the event's timezone
  const startLocal = getLocalDayAndMinute(startAt, tz);
  const endLocal = getLocalDayAndMinute(endAt, tz);

  // Simple case: event contained within one day
  const startMin = window.start_min ?? 0;
  const endMin = window.end_min ?? 1440;

  if (startLocal.dayOfYear === endLocal.dayOfYear && startLocal.year === endLocal.year) {
    if (!window.days.includes(startLocal.dow)) return false;
    // Overlap check on time-of-day
    return startLocal.minute < endMin && endLocal.minute > startMin;
  }

  // Multi-day event: mirror if ANY of the days overlaps window+time
  let cursor = new Date(startAt);
  while (cursor <= endAt) {
    const dayInfo = getLocalDayAndMinute(cursor, tz);
    if (window.days.includes(dayInfo.dow)) return true;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return false;
}

function getLocalDayAndMinute(d: Date, tz: string): { dow: number; minute: number; dayOfYear: number; year: number } {
  // Use Intl to get the local wall-clock in the given timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = weekdayMap[map.weekday] ?? 0;
  const hour = parseInt(map.hour === '24' ? '0' : map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  // Rough day-of-year for equality check (accurate enough for same-day comparison)
  const dayOfYear = month * 32 + day;

  return { dow, minute: hour * 60 + minute, dayOfYear, year };
}

/**
 * Human-readable summary of the window, for the dashboard UI.
 * Returns null if the window is 24/7.
 */
export function summarizeWindow(window: MirrorWindow | null | undefined): string | null {
  if (!window || !window.days || window.days.length === 0) return null;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sortedDays = [...window.days].sort();

  let dayStr: string;
  if (sortedDays.length === 7) dayStr = 'Every day';
  else if (sortedDays.join(',') === '1,2,3,4,5') dayStr = 'Mon-Fri';
  else if (sortedDays.join(',') === '0,6') dayStr = 'Weekends';
  else dayStr = sortedDays.map(d => dayNames[d]).join(', ');

  const startMin = window.start_min ?? 0;
  const endMin = window.end_min ?? 1440;
  const timeStr = (startMin === 0 && endMin === 1440)
    ? 'all day'
    : `${formatMin(startMin)} to ${formatMin(endMin)}`;

  return `${dayStr}, ${timeStr}`;
}

function formatMin(min: number): string {
  const hour = Math.floor(min / 60);
  const m = min % 60;
  const period = hour < 12 ? 'am' : 'pm';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
}
