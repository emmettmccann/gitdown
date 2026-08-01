/**
 * One row of the timeline.
 *
 * Two shapes only: a comment card, or the small icon-plus-sentence kind. The
 * switch at the bottom is the whole vocabulary of the feed, and an event kind
 * it does not recognise is a deploy-skew problem rather than a reason to blank
 * the thread.
 */
import type { ReactNode } from "react";
import type { ThreadEntry } from "../../api/thread.js";
import { cn } from "../../lib/cn.js";
import { BOT_ACTOR, STATUS_PAGE_URL } from "../../lib/constants.js";
import { avatarClass } from "../../lib/session.js";
import { renderBody, renderUserBody } from "../../lib/text.js";
import { humanizeStatus } from "../../lib/time.js";
import { LabelChip } from "../common/LabelChip.js";
import { Timestamp } from "../common/Timestamp.js";
import {
  AlertIcon,
  IssueClosedIcon,
  IssueOpenedIcon,
  PencilIcon,
  TagIcon,
  type IconProps,
} from "../ui/icons.js";
import { CommentCard } from "./CommentCard.js";

/**
 * `badge` fills the icon the way the state pill at the top of the page is
 * filled — reserved for opening and closing, so those two read as the events
 * that bracket the thread rather than as more label churn.
 */
interface EventRowProps {
  icon: (props: IconProps) => ReactNode;
  badge?: "state-open" | "state-closed";
  children: ReactNode;
}

function EventRow({ icon: Icon, badge, children }: EventRowProps) {
  return (
    <div className="timeline-row event">
      <div className={cn("timeline-icon", badge)}>
        <Icon size={14} />
      </div>
      <div className="timeline-event-text">{children}</div>
    </div>
  );
}

function Actor() {
  return <strong>{BOT_ACTOR}</strong>;
}

function metaString(entry: ThreadEntry, key: string): string {
  const value = entry.meta?.[key];
  return typeof value === "string" ? value : "";
}

/** A bot comment: the status update itself. */
function StatusUpdateRow({ entry }: { entry: ThreadEntry }) {
  const status = metaString(entry, "status");

  return (
    <CommentCard
      entry={entry}
      author={{ name: BOT_ACTOR, href: STATUS_PAGE_URL, bot: true, avatar: "avatar-c2" }}
      prefix={status ? `${humanizeStatus(status)} · ` : "commented "}
    >
      {entry.deleted ? (
        <em>This comment was removed upstream.</em>
      ) : (
        <p>{renderBody(entry.body ?? "")}</p>
      )}
    </CommentCard>
  );
}

/**
 * A comment somebody wrote.
 *
 * The display name is read from the row's own meta rather than looked up, so it
 * is whatever the author was called when they posted. Falling back to the
 * session id keeps a row with unexpected meta rendering as *something* instead
 * of an empty header.
 */
function UserCommentRow({ entry }: { entry: ThreadEntry }) {
  const name = metaString(entry, "name") || entry.actor;

  return (
    <CommentCard
      entry={entry}
      author={{ name, avatar: avatarClass(entry.actor) }}
      prefix="commented "
    >
      {entry.deleted ? (
        <em>This comment was removed.</em>
      ) : (
        <p>{renderUserBody(entry.body ?? "")}</p>
      )}
    </CommentCard>
  );
}

export function TimelineRow({ entry }: { entry: ThreadEntry }) {
  switch (entry.kind) {
    case "status_update":
      return <StatusUpdateRow entry={entry} />;

    case "comment":
      return <UserCommentRow entry={entry} />;

    case "opened":
      return (
        <EventRow icon={IssueOpenedIcon} badge="state-open">
          <Actor /> opened this issue <Timestamp at={entry.createdAt} />
        </EventRow>
      );

    case "component_changed":
      return (
        <EventRow icon={AlertIcon}>
          <strong>{metaString(entry, "component")}</strong> went from{" "}
          {humanizeStatus(metaString(entry, "from"))} to {humanizeStatus(metaString(entry, "to"))}{" "}
          <Timestamp at={entry.createdAt} />
        </EventRow>
      );

    case "label_added":
    case "label_removed":
      return (
        <EventRow icon={TagIcon}>
          <Actor /> {entry.kind === "label_added" ? "added" : "removed"}{" "}
          <LabelChip label={metaString(entry, "label")} /> <Timestamp at={entry.createdAt} />
        </EventRow>
      );

    case "renamed":
      return (
        <EventRow icon={PencilIcon}>
          <Actor /> changed the title <del>{metaString(entry, "from")}</del>{" "}
          <ins>{metaString(entry, "to")}</ins> <Timestamp at={entry.createdAt} />
        </EventRow>
      );

    case "closed":
      return (
        <EventRow icon={IssueClosedIcon} badge="state-closed">
          <Actor /> closed this as resolved <Timestamp at={entry.createdAt} />
        </EventRow>
      );

    case "reopened":
      return (
        <EventRow icon={IssueOpenedIcon} badge="state-open">
          <Actor /> reopened this <Timestamp at={entry.createdAt} />
        </EventRow>
      );

    default:
      return (
        <EventRow icon={AlertIcon}>
          <Actor /> {entry.kind} <Timestamp at={entry.createdAt} />
        </EventRow>
      );
  }
}
