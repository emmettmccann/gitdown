import { useEffect, useRef } from "react";
import type { ThreadEntry } from "../../api/thread.js";
import { TimelineRow } from "./TimelineRow.js";

export function Timeline({ entries }: { entries: ThreadEntry[] }) {
  const container = useRef<HTMLDivElement>(null);
  const pendingId = entries.filter((entry) => entry.pending).at(-1)?.id;

  // A comment you just wrote lands below the fold on a long thread. An
  // optimistic row is always the last one, so the container can find it without
  // every row having to report where it is.
  useEffect(() => {
    if (!pendingId) return;
    container.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [pendingId]);

  return (
    <div className="timeline" ref={container}>
      {entries.map((entry) => (
        <TimelineRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
