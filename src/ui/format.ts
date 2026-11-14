export function shortDate(value: string): string {
  const date =
    value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
export function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
export function formatDateTimeInput(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function parseDateTimeInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value))
    throw new Error('Enter local time as YYYY-MM-DD HH:mm.');
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime()) || formatDateTimeInput(date) !== value)
    throw new Error('Enter a valid local date and time.');
  return date.toISOString();
}
export function tryDateTime(value: string): string | null {
  try {
    return parseDateTimeInput(value);
  } catch {
    return null;
  }
}
