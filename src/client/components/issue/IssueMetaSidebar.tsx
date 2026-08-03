/**
 * The issue's right-hand sidebar.
 *
 * Section order and empty-state wording follow the real issue sidebar; the ones
 * gitdown can never fill stay as dead chrome. Only Labels and the source link
 * carry data.
 */
import { LabelChip } from "../common/LabelChip.js";
import { DeadButton, DeadLink } from "../ui/dead.js";
import { BellIcon, CommentIcon, LinkExternalIcon } from "../ui/icons.js";

interface IssueMetaSidebarProps {
  labels: string[];
  /** The incident on githubstatus.com, when the ingestion run recorded one. */
  shortlink: string;
}

export function IssueMetaSidebar({ labels, shortlink }: IssueMetaSidebarProps) {
  return (
    <aside className="issue-meta-sidebar">
      <div className="meta-section">
        <h3>Assignees</h3>
        <span className="empty">No one assigned</span>
      </div>

      <div className="meta-section">
        <h3>Labels</h3>
        <div>
          {/* Every other section states its own emptiness; labels should not be
              the one that just leaves a gap. */}
          {labels.length === 0 ? (
            <span className="empty">No labels</span>
          ) : (
            labels.map((label) => <LabelChip key={label} label={label} />)
          )}
        </div>
      </div>

      <div className="meta-section">
        <h3>Type</h3>
        <span className="empty">Incident</span>
      </div>
      <div className="meta-section">
        <h3>Projects</h3>
        <span className="empty">No projects</span>
      </div>
      <div className="meta-section">
        <h3>Milestone</h3>
        <span className="empty">No milestone</span>
      </div>
      <div className="meta-section">
        <h3>Relationships</h3>
        <span className="empty">None yet</span>
      </div>
      <div className="meta-section">
        <h3>Development</h3>
        <span className="empty">No branches or pull requests</span>
      </div>

      <div className="meta-section">
        <div className="meta-head">
          <h3>Notifications</h3>
          <DeadLink className="customize">Customize</DeadLink>
        </div>
        <DeadButton size="block">
          <BellIcon />
          Subscribe
        </DeadButton>
        <p className="note">
          You're not receiving notifications from this thread. You would not enjoy it if you were.
        </p>
      </div>

      <div className="meta-section">
        <h3>Participants</h3>
        <div className="avatar-stack">
          <span className="avatar-sm avatar-c2" title="githubstatus" />
        </div>
      </div>

      <div className="sidebar-links">
        {shortlink && (
          <a className="sidebar-action-link" href={shortlink}>
            <LinkExternalIcon />
            Open on githubstatus.com
          </a>
        )}
        <DeadLink className="sidebar-action-link">
          <CommentIcon />
          Give feedback
        </DeadLink>
      </div>
    </aside>
  );
}
