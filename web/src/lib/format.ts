/** meta.generated_at as Heilbronn local time, e.g. "28 Oct 2026" or "28 Oct 2026, 16:42"; the raw string if unparseable. */
export function formatDataDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    ...(withTime && { timeStyle: 'short' }),
    timeZone: 'Europe/Berlin',
  }).format(date);
}
