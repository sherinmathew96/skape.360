const TZ =
  process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Today's date in the studio's timezone, as YYYY-MM-DD. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const short = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const long = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "14 Nov", or "14 Nov 2027" when the year differs from this one. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(`${iso}T00:00:00Z`);
  const sameYear = iso.slice(0, 4) === today().slice(0, 4);
  return (sameYear ? short : long).format(d);
}

/** "Today", "Tomorrow", "3 days late", "in 5 days", or the date. */
export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "No date";
  const diff = daysBetween(today(), iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "1 day late";
  if (diff < 0) return `${-diff} days late`;
  if (diff <= 6) return `In ${diff} days`;
  return formatDate(iso);
}
