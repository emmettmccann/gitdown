import type { IssueState } from "../../../shared/api.js";
import { BOT_ACTOR, STATUS_PAGE_URL } from "../../lib/constants.js";
import { relativeTime } from "../../lib/time.js";
import { StateBadge } from "../common/StateBadge.js";
import { Button } from "../ui/button.js";
import { DeadButton, DEAD_HREF } from "../ui/dead.js";
import { CopyIcon } from "../ui/icons.js";

export interface IssueMeta {
  state: IssueState;
  createdAt: number;
  /** How many status updates the incident has produced so far. */
  updateCount: number;
}

interface IssueHeaderProps {
  title: string;
  number: number | null;
  /**
   * Absent until the thread loads. The metadata strip still renders — it is a
   * ruled band under the title, and having it appear late would shift the page.
   */
  meta: IssueMeta | null;
}

export function IssueHeader({ title, number, meta }: IssueHeaderProps) {
  return (
    <>
      <div className="issue-detail-header">
        <h1>
          <span>{title}</span>{" "}
          <span className="issue-number">{number === null ? "" : `#${number}`}</span>
        </h1>
        <div className="header-actions">
          <Button asChild>
            <a href={STATUS_PAGE_URL}>Real status page ↗</a>
          </Button>
          <Button variant="primary" asChild>
            <a href={DEAD_HREF}>New issue</a>
          </Button>
          <DeadButton variant="icon" bordered aria-label="Copy a permalink to this issue">
            <CopyIcon />
          </DeadButton>
        </div>
      </div>

      <div className="issue-meta-row">
        <div>{meta && <StateBadge state={meta.state} />}</div>
        <div className="issue-subtitle">
          {meta &&
            `${BOT_ACTOR} opened this ${relativeTime(meta.createdAt)} · ${meta.updateCount} update${
              meta.updateCount === 1 ? "" : "s"
            }`}
        </div>
      </div>
    </>
  );
}
