/**
 * The signed-in global header.
 *
 * Presentational: the repo breadcrumb and the account cluster are set dressing,
 * and every control in here except the two real links is dead chrome. Signed
 * in, the repo lives in the header breadcrumb; the title block with Star and
 * Fork that the signed-out views carry is gone entirely.
 */
import { Link } from "react-router";
import { SOURCE_URL } from "../../lib/constants.js";
import { DeadButton, deadHandlers } from "../ui/dead.js";
import { ProfileMenu } from "./ProfileMenu.js";
import {
  GitPullRequestIcon,
  InboxIcon,
  IssueOpenedIcon,
  MarkGithubIcon,
  PlusIcon,
  SearchIcon,
  SparkleIcon,
  ThreeBarsIcon,
  TriangleDownIcon,
} from "../ui/icons.js";

export function GlobalHeader() {
  return (
    <header className="gh-header">
      <DeadButton variant="icon" aria-label="Open global navigation menu">
        <ThreeBarsIcon />
      </DeadButton>

      <Link className="logo" to="/" aria-label="Homepage">
        <MarkGithubIcon size={32} />
      </Link>

      <div className="header-repo">
        <a className="owner" href="https://gitdown.chat/">
          gitdown
        </a>
        <span className="sep">/</span>
        <a className="name" href={SOURCE_URL} rel="noopener">
          gitdown
        </a>
        <DeadButton
          variant="icon"
          className="caret-btn"
          aria-label="Open repository context menu"
        >
          <TriangleDownIcon />
        </DeadButton>
      </div>

      <div className="spacer" />

      <div className="search" role="button" tabIndex={0} {...deadHandlers}>
        <SearchIcon />
        <span>
          Type <kbd>/</kbd> to search
        </span>
      </div>

      {/* The account cluster: assistant, create, issues, pull requests, inbox,
          avatar. Bordered ones are the menus, borderless ones are the
          destinations. */}
      <div className="header-actions">
        <div className="btn-split">
          <DeadButton variant="icon" bordered aria-label="Ask the assistant">
            <SparkleIcon />
          </DeadButton>
          <DeadButton variant="icon" bordered aria-label="Open assistant menu">
            <TriangleDownIcon />
          </DeadButton>
        </div>
        <DeadButton variant="icon" bordered aria-label="Create new…">
          <PlusIcon />
          <TriangleDownIcon />
        </DeadButton>
        <Link className="icon-btn" to="/" aria-label="Your issues">
          <IssueOpenedIcon />
        </Link>
        <DeadButton variant="icon" aria-label="Your pull requests">
          <GitPullRequestIcon />
        </DeadButton>
        <DeadButton variant="icon" className="notif-btn" aria-label="Notifications">
          <InboxIcon />
          <span className="unread-dot" />
        </DeadButton>
        {/* The one control in this cluster that leads somewhere. */}
        <ProfileMenu />
      </div>
    </header>
  );
}
