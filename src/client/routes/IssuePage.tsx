import { useEffect, type ReactNode } from "react";
import { useParams } from "react-router";
import { ApiError } from "../api/client.js";
import { useThread } from "../api/queries.js";
import { AppShell } from "../components/chrome/AppShell.js";
import { Composer } from "../components/composer/Composer.js";
import { IssueHeader, type IssueMeta } from "../components/issue/IssueHeader.js";
import { IssueMetaSidebar } from "../components/issue/IssueMetaSidebar.js";
import { Timeline } from "../components/issue/Timeline.js";
import { DEAD_HREF } from "../components/ui/dead.js";
import { useDocumentTitle } from "../lib/useDocumentTitle.js";

interface PageProps {
  title: string;
  number: number | null;
  meta?: IssueMeta;
  labels?: string[];
  shortlink?: string;
  children: ReactNode;
}

/** Title, metadata strip, conversation column, sidebar — in every state. */
function Page({ title, number, meta, labels = [], shortlink = "", children }: PageProps) {
  return (
    <AppShell>
      <div className="page-layout">
        <main className="issues-main">
          <IssueHeader title={title} number={number} meta={meta ?? null} />
          <div className="issue-content">
            <div className="issue-conversation">{children}</div>
            <IssueMetaSidebar labels={labels} shortlink={shortlink} />
          </div>
        </main>
      </div>
    </AppShell>
  );
}

/**
 * A single incident as a thread.
 *
 * The composer and the locked notice are the same slot: a live thread offers a
 * reply, a resolved one explains why it cannot (SPEC 9.3). Polling starts and
 * stops on its own — see `useThread`.
 */
export function IssuePage() {
  const params = useParams();
  const issueNumber = Number(params["issueNumber"]);
  const valid = Number.isInteger(issueNumber) && issueNumber >= 1;

  const thread = useThread(issueNumber, valid);
  const issue = thread.data;

  /**
   * A number nobody ever opened an incident for, or one that is not a number at
   * all. Either way it is a link to something that is not there, and every
   * other link to something that is not there lands on the unicorn.
   *
   * Only a 404 counts. A 500 or a dropped connection means the issue may well
   * exist and the site is having the sort of morning it exists to document —
   * throwing the URL away over that would be the wrong trade.
   */
  const gone = !valid || (thread.error instanceof ApiError && thread.error.status === 404);

  useEffect(() => {
    // `replace`, not `assign`: this is a redirect rather than a click, so Back
    // should return wherever they came from instead of a URL that bounces them
    // straight back here. Leaving the page for real is also what gets the
    // status code — the Worker answers /503 with it and a client-side hop
    // would render the joke behind a 200.
    if (gone) window.location.replace(DEAD_HREF);
  }, [gone]);

  useDocumentTitle(
    issue ? `${issue.title} · Issue #${issue.number} · gitdown` : "Issue · gitdown/gitdown",
  );

  // Data first: a poll that fails on a thread already on screen is not a reason
  // to replace it with an error. The page keeps everything it had, and the next
  // tick catches up.
  if (issue) {
    return (
      <Page
        title={issue.title}
        number={issue.number}
        meta={{
          state: issue.state,
          createdAt: issue.createdAt,
          updateCount: issue.entries.length,
        }}
        labels={issue.labels}
        shortlink={issue.shortlink}
      >
        <Timeline entries={issue.entries} />

        {issue.state === "closed" ? (
          <div className="locked-notice">
            <strong>This conversation has been locked.</strong> The incident is resolved, so there
            is nothing left to complain about.
          </div>
        ) : (
          <Composer issueNumber={issueNumber} />
        )}
      </Page>
    );
  }

  if (thread.isError && !gone) {
    return (
      <Page title="Issue" number={issueNumber}>
        <div className="timeline">
          <div className="empty-state">
            Could not load this issue. GitHub might not be the only thing that's down.
          </div>
        </div>
      </Page>
    );
  }

  // Waiting: either on the thread, or on the redirect that is already leaving.
  return (
    <Page title="Loading…" number={null}>
      <div className="timeline">
        <div className="timeline-row event">
          <div className="timeline-event-text">Loading…</div>
        </div>
      </div>
    </Page>
  );
}
