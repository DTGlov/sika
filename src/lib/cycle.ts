import { format, addMonths, addDays, parse } from 'date-fns';

export interface CycleWindow {
  start: Date;
  end: Date;
  label: string;
  isCurrent: boolean;
  startDateStr: string; // 'yyyy-MM-dd' for URL param
}

/**
 * Given any date and a cycleStartDay (1-28), return the cycle window
 * that contains that date.
 *
 * Example: date=Apr 17, cycleStartDay=27
 *   → day(17) < startDay(27), so cycle began Mar 27 and ends Apr 26
 *
 * Example: date=Apr 28, cycleStartDay=27
 *   → day(28) >= startDay(27), so cycle began Apr 27 and ends May 26
 *
 * When cycleStartDay=1 the cycle matches a calendar month exactly.
 */
export function getCycleForDate(date: Date, cycleStartDay: number): CycleWindow {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  let cycleStart: Date;
  if (day >= cycleStartDay) {
    cycleStart = new Date(year, month, cycleStartDay);
  } else {
    // Previous calendar month — clamp to last day if that month is shorter
    const prevMonthDate = new Date(year, month - 1, 1);
    const daysInPrev = new Date(year, month, 0).getDate();
    cycleStart = new Date(
      prevMonthDate.getFullYear(),
      prevMonthDate.getMonth(),
      Math.min(cycleStartDay, daysInPrev)
    );
  }

  const cycleEnd = addDays(addMonths(cycleStart, 1), -1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrent = today >= cycleStart && today <= cycleEnd;

  return {
    start: cycleStart,
    end: cycleEnd,
    label: buildLabel(cycleStart, cycleEnd, cycleStartDay),
    isCurrent,
    startDateStr: format(cycleStart, 'yyyy-MM-dd'),
  };
}

/**
 * Navigate cycles by offset from the current cycle.
 * offset=0 → current cycle, offset=-1 → previous cycle, etc.
 */
export function getCycleAtOffset(
  referenceDate: Date,
  cycleStartDay: number,
  offset: number
): CycleWindow {
  const current = getCycleForDate(referenceDate, cycleStartDay);
  return getCycleFromStartDate(addMonths(current.start, offset), cycleStartDay);
}

/**
 * Build a cycle from an explicit start date (used when re-constructing
 * from the URL ?cycle=yyyy-MM-dd param).
 */
export function getCycleFromStartDate(startDate: Date, cycleStartDay: number): CycleWindow {
  const cycleEnd = addDays(addMonths(startDate, 1), -1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrent = today >= startDate && today <= cycleEnd;

  return {
    start: startDate,
    end: cycleEnd,
    label: buildLabel(startDate, cycleEnd, cycleStartDay),
    isCurrent,
    startDateStr: format(startDate, 'yyyy-MM-dd'),
  };
}

/** Parse a ?cycle=yyyy-MM-dd URL param safely; returns null on bad input. */
export function parseCycleParam(param: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  try {
    return parse(param, 'yyyy-MM-dd', new Date());
  } catch {
    return null;
  }
}

function buildLabel(start: Date, end: Date, cycleStartDay: number): string {
  if (cycleStartDay === 1) {
    return format(start, 'MMMM yyyy');
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

// TODO(phase-1.5): Use cycle for income streak tracking
