import { exactTime, relativeTime } from "../../lib/time.js";

interface TimestampProps {
  at: number;
  /** "commented ", "investigating · " — whatever leads into the time. */
  prefix?: string;
}

/**
 * A relative time with the real one on hover.
 *
 * It re-reads the clock on every render, so a thread that has been open for an
 * hour ages its own timestamps as it polls rather than freezing them at the
 * moment the page loaded.
 */
export function Timestamp({ at, prefix = "" }: TimestampProps) {
  return (
    <span className="when" title={exactTime(at)}>
      {prefix}
      {relativeTime(at)}
    </span>
  );
}
