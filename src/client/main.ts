/**
 * Page controllers. One bundle serves both views and dispatches on what it
 * finds in the DOM.
 */
import { fetchIssue, fetchIssues, fetchTimeline } from "./api.js";
import { BOT_ACTOR, issueRow, labelChip, stateBadge, timelineRow } from "./render.js";
import { startPolling } from "./poll.js";
import { relativeTime } from "./time.js";
import { randomQuip } from "./quips.js";
import type { IssueState } from "../shared/api.js";

/** Live threads move on the order of minutes; 5s feels instant enough. */
const POLL_INTERVAL_MS = 5_000;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

function setText(id: string, text: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  // An <input> shows its value, not its text content; setting textContent on
  // one silently does nothing.
  if (element instanceof HTMLInputElement) element.value = text;
  else element.textContent = text;
}

function showFailure(target: HTMLElement, message: string): void {
  target.replaceChildren();
  const box = document.createElement("div");
  box.className = "empty-state";
  box.textContent = message;
  target.appendChild(box);
}

// ---------------------------------------------------------------- issues list

async function initIssueList(): Promise<void> {
  const list = requireElement<HTMLUListElement>("issue-list");
  const params = new URLSearchParams(location.search);
  const state: IssueState = params.get("state") === "closed" ? "closed" : "open";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  document.getElementById("tab-open")?.classList.toggle("active", state === "open");
  document.getElementById("tab-closed")?.classList.toggle("active", state === "closed");
  setText("filter-query", `is:issue state:${state}`);

  let result;
  try {
    result = await fetchIssues(state, page);
  } catch {
    showFailure(list, "Could not load issues. GitHub might not be the only thing that's down.");
    return;
  }

  setText("count-open", String(result.counts.open));
  setText("count-closed", String(result.counts.closed));
  setText("issues-tab-count", String(result.counts.open));

  list.replaceChildren();

  if (result.issues.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    // NOTE: the "All Systems Operational" empty state is the reserved joke slot
    // (SPEC 12.1) and is deliberately still plain. This is the *common* case —
    // GitHub is usually fine — so whatever goes here is the most-seen copy on
    // the site.
    empty.textContent =
      state === "open"
        ? "No open issues. All systems operational."
        : "No closed issues yet.";
    list.appendChild(empty);
  } else {
    for (const issue of result.issues) list.appendChild(issueRow(issue));
  }

  renderPager(state, page, result.hasMore);
}

function renderPager(state: IssueState, page: number, hasMore: boolean): void {
  const pager = document.getElementById("pager");
  if (!pager) return;
  pager.replaceChildren();

  const link = (label: string, target: number) => {
    const anchor = document.createElement("a");
    anchor.className = "btn";
    anchor.textContent = label;
    anchor.href = `/?state=${state}&page=${target}`;
    return anchor;
  };

  if (page > 1) pager.appendChild(link("← Newer", page - 1));
  if (hasMore) pager.appendChild(link("Older →", page + 1));
}

// --------------------------------------------------------------- issue detail

async function initIssueDetail(): Promise<void> {
  const timeline = requireElement("timeline");
  const number = Number(/\/issues\/(\d+)/.exec(location.pathname)?.[1] ?? 0);

  if (!Number.isInteger(number) || number < 1) {
    showFailure(timeline, "That is not an issue number.");
    return;
  }

  let issue;
  try {
    issue = await fetchIssue(number);
  } catch {
    showFailure(timeline, `Issue #${number} does not exist.`);
    return;
  }

  document.title = `${issue.title} · Issue #${issue.number} · gitdown`;
  setText("issue-title", issue.title);
  setText("issue-number", `#${issue.number}`);

  const badge = requireElement("issue-state");
  badge.replaceChildren(stateBadge(issue.state));

  const subtitle = document.getElementById("issue-subtitle");
  if (subtitle) {
    subtitle.textContent =
      `${BOT_ACTOR} opened this ${relativeTime(issue.createdAt)}` +
      ` · ${issue.events.length} update${issue.events.length === 1 ? "" : "s"}`;
  }

  const source = document.getElementById("issue-source");
  if (source instanceof HTMLAnchorElement && issue.shortlink) {
    source.href = issue.shortlink;
    source.hidden = false;
  }

  renderLabels(issue.labels);

  timeline.replaceChildren();
  for (const entry of issue.events) timeline.appendChild(timelineRow(entry));

  let cursor = issue.cursor;
  const locked = requireElement("locked-notice");

  const markClosed = () => {
    locked.hidden = false;
    badge.replaceChildren(stateBadge("closed"));
  };

  if (issue.state === "closed") {
    markClosed();
    return; // frozen forever: nothing to poll
  }

  startPolling(async () => {
    const update = await fetchTimeline(number, cursor);
    for (const entry of update.events) timeline.appendChild(timelineRow(entry));
    cursor = update.cursor;

    if (update.state === "closed") {
      markClosed();
      return false;
    }
    return true;
  }, { intervalMs: POLL_INTERVAL_MS });
}

function renderLabels(labels: string[]): void {
  const container = document.getElementById("issue-labels");
  if (!container) return;
  if (labels.length === 0) {
    // Every other sidebar section states its own emptiness; labels should not
    // be the one that just leaves a gap.
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "No labels";
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...labels.map(labelChip));
}

// ------------------------------------------------------------- dead chrome

/**
 * The page is dense with controls that look interactive and are not: nav
 * dropdowns, the search box, the filter menus. They are <button>/<div>, so an
 * href cannot cover them — send them to the same place the dead links go.
 */
function wireDeadChrome(): void {
  const selectors = [
    ".gh-header nav button",
    ".issue-list-toolbar .filters button",
    ".gh-header .search",
  ].join(", ");

  for (const element of document.querySelectorAll(selectors)) {
    element.addEventListener("click", () => {
      location.href = "/503";
    });
  }
}

// --------------------------------------------------------------------- boot

function boot(): void {
  wireDeadChrome();

  const quip = document.getElementById("quip");
  if (quip) {
    // Chosen per page load rather than baked into the HTML, so the asset stays
    // cacheable and a refresh still gets you a different one.
    quip.textContent = randomQuip();
    return;
  }

  if (document.getElementById("issue-list")) {
    void initIssueList();
  } else if (document.getElementById("timeline")) {
    void initIssueDetail();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
