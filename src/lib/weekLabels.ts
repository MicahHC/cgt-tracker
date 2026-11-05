const TRACKER_WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

export function trackerWeekLabel(date: Date): string {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function recentTrackerWeeks(date = new Date(), count = 12): string[] {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1);
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(monday);
    current.setUTCDate(current.getUTCDate() - index * 7);
    return trackerWeekLabel(current);
  });
}

export function formatTrackerWeekLabel(label: string | null | undefined): string {
  const range = getTrackerWeekRange(label);
  if (!range) return label || 'Unlabeled week';

  return formatDateRange(range.start, range.end);
}

export function formatTrackerWeekWithCode(label: string | null | undefined): string {
  if (!label) return 'Unlabeled week';
  const display = formatTrackerWeekLabel(label);
  return display === label ? label : `${display} (${label})`;
}

export function getTrackerWeekRange(label: string | null | undefined): { start: Date; end: Date } | null {
  const match = label?.match(TRACKER_WEEK_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const start = new Date(januaryFourth);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() || 7) + 1 + (week - 1) * 7);
  if (trackerWeekLabel(start) !== label) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end };
}

function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${formatMonthDay(start)}-${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }

  if (sameYear) {
    return `${formatMonthDay(start)}-${formatMonthDay(end)}, ${end.getUTCFullYear()}`;
  }

  return `${formatMonthDayYear(start)}-${formatMonthDayYear(end)}`;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatMonthDayYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
