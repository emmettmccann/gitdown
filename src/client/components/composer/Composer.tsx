/**
 * The comment composer (SPEC 9).
 *
 * Three controls post for real — the textarea, Comment, and the display-name
 * editor above it. Everything else in here, the whole markdown toolbar
 * included, is parody chrome routed to the unicorn page. The block does not
 * render at all on a resolved incident, where the thread is locked (SPEC 9.3).
 *
 * It is a real `<form>`, which is what gives the Comment button its submit
 * semantics for free; every other button inside it is `type="button"` by
 * default, so none of them can post by accident.
 */
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_COMMENT_LENGTH } from "../../../shared/api.js";
import { ApiError } from "../../api/client.js";
import { useComment } from "../../api/queries.js";
import { useSession } from "../../lib/session.js";
import { Button } from "../ui/button.js";
import { DeadButton, DeadLink } from "../ui/dead.js";
import { BookIcon, IssueClosedSplitIcon, PaperclipIcon } from "../ui/icons.js";
import { IdentityBar } from "./IdentityBar.js";
import { MarkdownToolbar } from "./MarkdownToolbar.js";

/** How long the button stands in for a status line the composer does not have. */
const FLASH_MS = 2_500;

function flashLabel(error: Error | null): string {
  if (!error) return "Comment";
  return error instanceof ApiError && error.status === 403 ? "Name is taken" : "Try again";
}

export function Composer({ issueNumber }: { issueNumber: number }) {
  const session = useSession();
  const comment = useComment(issueNumber);
  const [body, setBody] = useState("");

  const trimmed = body.trim();
  /** The real composer greys Comment out until there is something to post. */
  const usable =
    !comment.isPending && trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LENGTH;

  // A transient write failure. Inventing a status line for the unhappy path is
  // more chrome than the case deserves, so the button says what happened and
  // then goes back to being a button.
  const { error, reset } = comment;
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(reset, FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [error, reset]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!usable) return;

    comment.mutate(
      { body: trimmed, session },
      {
        onError: (failure) => {
          // A 409 means the thread locked and this whole block is about to
          // disappear; the card keeps the text. Anything else is worth another
          // go, so the text goes back where they would look for it.
          if (!(failure instanceof ApiError && failure.status === 409)) setBody(trimmed);
        },
      },
    );
    setBody("");
  };

  /** Cmd/Ctrl+Enter posts, the way the real composer does. */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="add-comment">
      <h2>Add a comment</h2>
      <IdentityBar />

      <form className="composer" onSubmit={send}>
        <MarkdownToolbar />

        <textarea
          placeholder="Use Markdown to format your comment"
          aria-label="Comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="composer-footer">
          <span className="attach">
            <PaperclipIcon />
            Paste, drop, or click to add files
          </span>
          <div className="composer-actions">
            <div className="btn-group">
              <DeadButton variant="default">
                <IssueClosedSplitIcon />
                Close issue
              </DeadButton>
              <DeadButton variant="default" aria-label="Close with comment options">
                ▾
              </DeadButton>
            </div>
            <Button type="submit" variant="primary" disabled={!usable}>
              {flashLabel(comment.error)}
            </Button>
          </div>
        </div>
      </form>

      <div className="composer-note">
        <BookIcon />
        <span>
          Please follow this repository's <DeadLink>security policy</DeadLink>.
        </span>
      </div>
    </div>
  );
}
