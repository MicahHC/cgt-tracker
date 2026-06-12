const TRACKER_WEEK_PATTERN = /^(\d{4})-W(\d{1,2})$/;

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
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startOffset = Math.max(0, 7 * week - 7 - jan1.getDay());
  const endOffset = Math.min(dayOfYear(dec31) - 1, 7 * week - jan1.getDay() - 1);

  if (startOffset > endOffset) return null;

  return {
    start: addDays(jan1, startOffset),
    end: addDays(jan1, endOffset),
  };
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${formatMonthDay(start)}-${end.getDate()}, ${end.getFullYear()}`;
  }

  if (sameYear) {
    return `${formatMonthDay(start)}-${formatMonthDay(end)}, ${end.getFullYear()}`;
  }

  return `${formatMonthDayYear(start)}-${formatMonthDayYear(end)}`;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthDayYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
