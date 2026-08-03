import { Link } from "react-router";
import type { IssueSummary } from "../../../shared/api.js";
import { BOT_ACTOR } from "../../lib/constants.js";
import { LabelChip } from "../common/LabelChip.js";
import { Timestamp } from "../common/Timestamp.js";
import { IssueClosedIcon, IssueOpenedIcon } from "../ui/icons.js";

export function IssueRow({ issue }: { issue: IssueSummary }) {
  const open = issue.state === "open";
  const Icon = open ? IssueOpenedIcon : IssueClosedIcon;

  return (
    <li className="issue-row">
      <span className="state-icon">
        <Icon style={{ color: `var(--color-${open ? "open" : "closed"}-bg)` }} />
      </span>

      <div className="issue-body">
        <Link className="issue-title" to={`/issues/${issue.number}`}>
          {issue.title}
        </Link>
        {issue.labels.map((label) => (
          <LabelChip key={label} label={label} />
        ))}

        <div className="issue-meta">
          {`#${issue.number} · ${BOT_ACTOR} ${open ? "opened" : "closed"} `}
          <Timestamp at={open ? issue.createdAt : (issue.resolvedAt ?? issue.updatedAt)} />
          {issue.commentCount > 0 &&
            ` · ${issue.commentCount} comment${issue.commentCount === 1 ? "" : "s"}`}
        </div>
      </div>
    </li>
  );
}
