export function indiaDate(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
export function availabilityDates(now = new Date()) {
  const today = indiaDate(now);
  const tomorrow = indiaDate(new Date(now.getTime() + 24 * 60 * 60_000));
  return { today, tomorrow };
}
export function validateAvailabilityRange(startAt: string, endAt: string, now = new Date()) {
  const start = new Date(startAt), end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Choose valid start and end times.';
  const { today, tomorrow } = availabilityDates(now);
  const day = indiaDate(start);
  if (day !== today && day !== tomorrow) return 'Choose Today or Tomorrow. Past dates are not allowed.';
  if (start.getTime() < Math.floor(now.getTime() / 60_000) * 60_000) return 'Start time must be the current minute or later.';
  if (end <= start || end.getTime() - start.getTime() >= 24 * 60 * 60_000) return 'Choose a different End Time within 24 hours of Start Time.';
  return null;
}
export function formatAvailabilityTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\b(am|pm)\b/g, period => period.toUpperCase());
}
export function withTimePeriod(value: string, period: string) {
  const [hour, minute] = value.split(':');
  return `${String(Number(hour) % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}
export function availabilityTimestamp(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

export function availabilityRange(date: string, startTime: string, endTime: string) {
  const valid = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!valid.test(startTime) || !valid.test(endTime)) return { error: 'Choose valid start and end times.' };
  if (startTime === endTime) return { error: 'Choose a different End Time from Start Time.' };
  const startAt = availabilityTimestamp(date, startTime);
  const nextDay = endTime < startTime;
  const endDate = nextDay ? indiaDate(new Date(new Date(`${date}T12:00:00+05:30`).getTime() + 86400000)) : date;
  return { startAt, endAt: availabilityTimestamp(endDate, endTime), endDate, nextDay };
}
