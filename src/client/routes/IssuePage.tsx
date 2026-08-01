import type { ReactNode } from "react";
import { useParams } from "react-router";
import { useThread } from "../api/queries.js";
import { AppShell } from "../components/chrome/AppShell.js";
import { Composer } from "../components/composer/Composer.js";
import { IssueHeader, type IssueMeta } from "../components/issue/IssueHeader.js";
import { IssueMetaSidebar } from "../components/issue/IssueMetaSidebar.js";
import { Timeline } from "../components/issue/Timeline.js";
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

  useDocumentTitle(
    issue ? `${issue.title} · Issue #${issue.number} · gitdown` : "Issue · gitdown/gitdown",
  );

  if (!valid) {
    return (
      <Page title="Issue" number={null}>
        <div className="timeline">
          <div className="empty-state">That is not an issue number.</div>
        </div>
      </Page>
    );
  }

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

  if (thread.isError) {
    return (
      <Page title="Issue" number={issueNumber}>
        <div className="timeline">
          <div className="empty-state">Issue #{issueNumber} does not exist.</div>
        </div>
      </Page>
    );
  }

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
