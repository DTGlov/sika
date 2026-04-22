export function startOfFridayWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 5=Fri
  const daysBack = (dayOfWeek - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

export function endOfFridayWeek(date: Date): Date {
  const start = startOfFridayWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
