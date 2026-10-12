
/**
 * Calculate working days between two dates, excluding weekends + given holidays.
 *
 * @param {string} from         - 'YYYY-MM-DD' start (inclusive)
 * @param {string} resumingDate - 'YYYY-MM-DD' return-to-work date (exclusive)
 * @param {string[]} holidays   - Array of 'YYYY-MM-DD' holiday strings
 * @returns {string} Day count as string (or '' if inputs invalid)
 */
export function calculateWorkingDays(from, resumingDate, holidays = []) {
  if (!from || !resumingDate) return '';

  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = resumingDate.split('-').map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  if (end <= start) return '';

  const holidaySet = new Set(holidays);

  const toKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  let workingDays = 0;
  const cur = new Date(start);
  while (cur < end) {
    const dow = cur.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidaySet.has(toKey(cur));
    if (!isWeekend && !isHoliday) workingDays++;
    cur.setDate(cur.getDate() + 1);
  }

  return workingDays > 0 ? workingDays.toString() : '0';
}

export function yearsInRange(from, to) {
  if (!from || !to) return [];
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  if (isNaN(startYear) || isNaN(endYear)) return [];
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}