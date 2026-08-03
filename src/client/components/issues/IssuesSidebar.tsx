/**
 * The side nav on the signed-in issues dashboard.
 *
 * Presentational. Only the first entry is a destination; the rest are the
 * dashboard's other views, which gitdown has nothing to put in.
 */
import { Link } from "react-router";
import { DeadButton, DeadLink } from "../ui/dead.js";
import {
  ClockIcon,
  CommentIcon,
  IssueOpenedIcon,
  MentionIcon,
  MilestoneIcon,
  PeopleIcon,
  ProjectIcon,
  SidebarCollapseIcon,
  SmileyIcon,
  StackIcon,
  TagDotIcon,
} from "../ui/icons.js";

export function IssuesSidebar() {
  return (
    <aside className="issues-sidebar">
      <nav>
        <ul>
          <li>
            <Link className="active" to="/">
              <IssueOpenedIcon /> Issues
            </Link>
          </li>
          <li>
            <DeadLink>
              <PeopleIcon /> Assigned to me
            </DeadLink>
          </li>
          <li>
            <DeadLink>
              <SmileyIcon /> Created by me
            </DeadLink>
          </li>
          <li>
            <DeadLink>
              <MentionIcon /> Mentioned
            </DeadLink>
          </li>
          <li>
            <DeadLink>
              <ClockIcon /> Recent activity
            </DeadLink>
          </li>
        </ul>
        <ul>
          <li>
            <DeadLink>
              <StackIcon /> Views
            </DeadLink>
          </li>
          <li>
            <DeadLink>
              <ProjectIcon /> Projects
            </DeadLink>
          </li>
          <li>
            <DeadLink>
              <MilestoneIcon /> Milestones
            </DeadLink>
          </li>
          <li>
            <DeadLink>
              <TagDotIcon /> Labels
            </DeadLink>
          </li>
        </ul>
      </nav>

      {/* The pair pinned under the nav on the signed-in issues dashboard. */}
      <div className="sidebar-footer">
        <DeadLink>
          <CommentIcon />
          Feedback
          <span className="preview-badge">Preview</span>
        </DeadLink>
        <DeadButton>
          <SidebarCollapseIcon />
          Collapse sidebar
        </DeadButton>
      </div>
    </aside>
  );
}
