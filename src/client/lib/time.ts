/**
 * GitHub-style timestamps: relative while recent, absolute once it stops
 * mattering exactly how long ago something was.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function relativeTime(at: number, now: number = Date.now()): string {
  const elapsed = now - at;

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 30 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return `on ${(sameYear ? MONTH_DAY : WITH_YEAR).format(date)}`;
}

/** Full timestamp for the `title` attribute, so hovering gives the real thing. */
export function exactTime(at: number): string {
  return new Date(at).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** "major outage" reads better in a sentence than "major_outage". */
export function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ");
}
