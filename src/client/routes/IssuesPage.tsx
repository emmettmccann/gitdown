import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { IssueState } from "../../shared/api.js";
import { issuesQuery } from "../api/queries.js";
import { AppShell } from "../components/chrome/AppShell.js";
import { FilterBar } from "../components/issues/FilterBar.js";
import { IssueRow } from "../components/issues/IssueRow.js";
import { IssuesSidebar } from "../components/issues/IssuesSidebar.js";
import { ListToolbar } from "../components/issues/ListToolbar.js";
import { Pager } from "../components/issues/Pager.js";
import { Button } from "../components/ui/button.js";
import { DEAD_HREF } from "../components/ui/dead.js";
import { useDocumentTitle } from "../lib/useDocumentTitle.js";

function EmptyState({ children }: { children: string }) {
  return (
    <li>
      <div className="empty-state">{children}</div>
    </li>
  );
}

export function IssuesPage() {
  const [params] = useSearchParams();
  const state: IssueState = params.get("state") === "closed" ? "closed" : "open";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const issues = useQuery(issuesQuery(state, page));
  useDocumentTitle("Issues · gitdown/gitdown");

  const counts = issues.data?.counts;

  return (
    <AppShell issuesCount={counts ? String(counts.open) : "–"}>
      <div className="page-layout with-sidebar">
        <IssuesSidebar />

        <main className="issues-main">
          <div className="page-title-row">
            <h1>All issues</h1>
            <Button variant="primary" asChild>
              <a href={DEAD_HREF}>New issue</a>
            </Button>
          </div>

          <FilterBar state={state} />
          <ListToolbar state={state} counts={counts} />

          <ul className="issue-list">
            {issues.isPending && (
              <li className="issue-row">
                <div className="issue-body">
                  <div className="issue-meta">Loading…</div>
                </div>
              </li>
            )}

            {issues.isError && (
              <EmptyState>
                Could not load issues. GitHub might not be the only thing that's down.
              </EmptyState>
            )}

            {issues.data?.issues.length === 0 && (
              // NOTE: the "All Systems Operational" empty state is the reserved
              // joke slot (SPEC 12.1) and is deliberately still plain. This is
              // the *common* case — GitHub is usually fine — so whatever goes
              // here is the most-seen copy on the site.
              <EmptyState>
                {state === "open"
                  ? "No open issues. All systems operational."
                  : "No closed issues yet."}
              </EmptyState>
            )}

            {issues.data?.issues.map((issue) => (
              <IssueRow key={issue.number} issue={issue} />
            ))}
          </ul>

          <Pager state={state} page={page} hasMore={issues.data?.hasMore ?? false} />
        </main>
      </div>
    </AppShell>
  );
}
