/**
 * The repo tab strip under the header.
 *
 * No repo title block: the signed-in issue views carry the repo in the header
 * breadcrumb instead, and Star/Fork/Watch live on the Code tab.
 */
import { Link } from "react-router";
import { DeadLink } from "../ui/dead.js";

interface RepoTabsProps {
  /**
   * The open-issue count on the Issues tab. Only the pages that have actually
   * counted pass one; the issue view never knew the number and did not show it.
   */
  issuesCount?: string;
}

export function RepoTabs({ issuesCount }: RepoTabsProps) {
  return (
    <div className="repo-header">
      <ul className="repo-tabs">
        <li>
          <DeadLink>Code</DeadLink>
        </li>
        <li>
          <Link className="active" to="/">
            {issuesCount === undefined ? (
              "Issues"
            ) : (
              <>
                Issues <span className="count">{issuesCount}</span>
              </>
            )}
          </Link>
        </li>
        <li>
          <DeadLink>
            Pull requests <span className="count">0</span>
          </DeadLink>
        </li>
        <li>
          <DeadLink>Actions</DeadLink>
        </li>
        <li>
          <DeadLink>Projects</DeadLink>
        </li>
        <li>
          <DeadLink>Security</DeadLink>
        </li>
        <li>
          <DeadLink>Insights</DeadLink>
        </li>
      </ul>
    </div>
  );
}
