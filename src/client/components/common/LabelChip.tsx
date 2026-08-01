import { cn } from "../../lib/cn.js";

const IMPACT_PREFIX = "impact:";

/** Impact labels get severity colours; component labels are neutral. */
function labelClass(label: string): string {
  switch (label) {
    case "impact:critical":
      return "label-red";
    case "impact:major":
      return "label-orange";
    case "impact:minor":
      return "label-yellow";
    case "impact:none":
      return "label-gray";
    default:
      return "label-blue";
  }
}

export function LabelChip({ label }: { label: string }) {
  const title = label.startsWith(IMPACT_PREFIX)
    ? `Incident impact: ${label.slice(IMPACT_PREFIX.length)}`
    : `Affected component: ${label}`;

  return (
    <span className={cn("label-chip", labelClass(label))} title={title}>
      {label}
    </span>
  );
}
