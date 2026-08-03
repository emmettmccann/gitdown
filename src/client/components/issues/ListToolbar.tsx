import { Link } from "react-router";
import type { IssueState } from "../../../shared/api.js";
import { cn } from "../../lib/cn.js";
import { Toolbar, ToolbarButton } from "../ui/toolbar.js";
import { goDead } from "../ui/dead.js";
import { IssueClosedSplitIcon, IssueOpenedSplitIcon, SortIcon } from "../ui/icons.js";

const FILTERS = ["Author", "Labels", "Projects", "Milestones", "Assignees", "Types"];

interface ListToolbarProps {
  state: IssueState;
  /** Absent until the list has loaded, which is what the dashes are for. */
  counts?: { open: number; closed: number };
}

/**
 * Open/Closed on the left, the filter menus on the right.
 *
 * The two state tabs are the only live controls on the strip — they are links
 * that change the query — and the counts beside them render as Primer Counters
 * rather than bare numbers.
 */
export function ListToolbar({ state, counts }: ListToolbarProps) {
  return (
    <div className="issue-list-toolbar">
      <div className="state-tabs">
        <Link className={cn(state === "open" && "active")} to="/?state=open">
          <IssueOpenedSplitIcon style={{ color: "var(--color-open-bg)" }} /> Open{" "}
          <span className="counter">{counts?.open ?? "–"}</span>
        </Link>
        <Link className={cn(state === "closed" && "active")} to="/?state=closed">
          <IssueClosedSplitIcon /> Closed <span className="counter">{counts?.closed ?? "–"}</span>
        </Link>
      </div>

      <Toolbar className="filters" aria-label="Filter issues">
        {FILTERS.map((filter) => (
          <ToolbarButton key={filter} onClick={goDead}>
            {filter} ▾
          </ToolbarButton>
        ))}
        <ToolbarButton className="sort-button" onClick={goDead}>
          <SortIcon />
          Newest ▾
        </ToolbarButton>
      </Toolbar>
    </div>
  );
}
