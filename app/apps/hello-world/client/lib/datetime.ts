/** Format a Date as a value for <input type="datetime-local"> (local time). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

/** Convert a datetime-local input value (local time) to an ISO-8601 string. */
export function datetimeLocalToISO(value: string): string {
  // `new Date("YYYY-MM-DDTHH:mm")` is interpreted as local time.
  return new Date(value).toISOString();
}

/** A datetime-local default value a few minutes in the future. */
export function defaultScheduleValue(minutesAhead = 15): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  d.setSeconds(0, 0);
  return toDatetimeLocalValue(d);
}

/** Human-readable representation of an ISO timestamp. */
export function formatISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
