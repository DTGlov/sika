/**
 * For a given reference date and cycle_start_day, compute the start and end
 * of the budget month that JUST ENDED.
 *
 * Example: cycle_start_day = 27, today = May 27
 *   → month started Apr 27, ended May 26
 *
 * Example: cycle_start_day = 1, today = Feb 1
 *   → month started Jan 1, ended Jan 31
 */
export function getCycleMonthBounds(
  referenceDate: Date,
  cycleStartDay: number,
): { start: Date; end: Date } {
  const ref = new Date(referenceDate);
  ref.setUTCHours(0, 0, 0, 0);

  const refDay = ref.getUTCDate();

  let startMonth: number;
  let startYear: number;

  if (refDay >= cycleStartDay) {
    // We're in or past this month's cycle — the "just ended" month
    // started cycleStartDay of the PREVIOUS month
    startMonth = ref.getUTCMonth() - 1;
    startYear = ref.getUTCFullYear();
  } else {
    // We're before this month's cycle start — the "just ended" month
    // started cycleStartDay of 2 months ago
    startMonth = ref.getUTCMonth() - 2;
    startYear = ref.getUTCFullYear();
  }

  const start = new Date(Date.UTC(startYear, startMonth, cycleStartDay, 0, 0, 0, 0));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, cycleStartDay - 1, 23, 59, 59, 999));

  return { start, end };
}

/**
 * Returns true if today is the last day of the user's budget cycle
 * (i.e., tomorrow is cycleStartDay). Used by the cron to decide
 * whether to generate a recap for this user today.
 */
export function isCycleEndDate(today: Date, cycleStartDay: number): boolean {
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.getUTCDate() === cycleStartDay;
}
