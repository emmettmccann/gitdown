/**
 * The comment card, shared by bot updates and visitor comments.
 *
 * They differ only in who the header names and how the body is rendered — the
 * card, the kebab and the timestamp are the same object, and keeping them one
 * component is what stops the two drifting apart visually.
 */
import type { ReactNode } from "react";
import type { ThreadEntry } from "../../api/thread.js";
import { cn } from "../../lib/cn.js";
import { Timestamp } from "../common/Timestamp.js";
import { DeadButton } from "../ui/dead.js";
import { KebabIcon } from "../ui/icons.js";

export interface Author {
  name: string;
  /** Bot rows link out to the source; a visitor has nowhere to link to. */
  href?: string;
  bot?: boolean;
  avatar: string;
}

interface CommentCardProps {
  entry: ThreadEntry;
  author: Author;
  /** What leads into the timestamp: "commented ", "investigating · ". */
  prefix: string;
  children: ReactNode;
}

export function CommentCard({ entry, author, prefix, children }: CommentCardProps) {
  return (
    <div
      className={cn("timeline-row", entry.pending && "pending", entry.failure && "failed")}
    >
      <div className="timeline-comment comment-box">
        <div className="comment-header">
          {/* Signed in, the avatar is inside the card next to the name rather
              than out in the timeline gutter. */}
          <div>
            <span className={cn("avatar", author.avatar)} />
            {author.href ? (
              <a className="who" href={author.href}>
                {author.name}
              </a>
            ) : (
              <span className="who">{author.name}</span>
            )}
            {author.bot && <span className="role-pill bot">bot</span>}
            <Timestamp at={entry.createdAt} prefix={prefix} />
            {entry.editedAt !== null && <span className="when"> · edited</span>}
          </div>

          <div className="comment-actions">
            <DeadButton variant="icon" aria-label="Comment options">
              <KebabIcon />
            </DeadButton>
          </div>
        </div>

        <div className="comment-body">{children}</div>

        {entry.failure && <div className="comment-failure">{entry.failure}</div>}
      </div>
    </div>
  );
}
