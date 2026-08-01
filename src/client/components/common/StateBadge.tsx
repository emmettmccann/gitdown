import type { IssueState } from "../../../shared/api.js";
import { cn } from "../../lib/cn.js";
import { IssueClosedIcon, IssueOpenedIcon } from "../ui/icons.js";

/** The pill at the top of an issue: green while it is happening, purple after. */
export function StateBadge({ state }: { state: IssueState }) {
  const Icon = state === "open" ? IssueOpenedIcon : IssueClosedIcon;

  return (
    <div className={cn("state-badge", state === "closed" && "closed")}>
      <Icon fill="#fff" /> {state === "open" ? "Open" : "Closed"}
    </div>
  );
}
