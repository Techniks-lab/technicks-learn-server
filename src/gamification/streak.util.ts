export function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n));
}

/**
 * Given every date a user has checked in, compute the current consecutive
 * streak (ending today or yesterday) and the longest streak on record.
 */
export function computeStreaks(
  dates: string[],
  today: string,
): { streak: number; longestStreak: number } {
  const set = new Set(dates);

  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const unique = [...set].sort().reverse();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of unique) {
    run = prev !== null && addDays(date, 1) === prev ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = date;
  }

  return { streak, longestStreak: longest };
}
