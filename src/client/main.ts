/**
 * Page controllers. One bundle serves both views and dispatches on what it
 * finds in the DOM.
 */
import {
  ApiError,
  fetchIssue,
  fetchIssues,
  fetchTimeline,
  postComment,
  putDisplayName,
} from "./api.js";
import {
  BOT_ACTOR,
  issueRow,
  labelChip,
  stateBadge,
  timelineRow,
  userCommentRow,
} from "./render.js";
import { startPolling } from "./poll.js";
import { avatarClass, getSession, setDisplayName } from "./session.js";
import { relativeTime } from "./time.js";
import { randomQuip } from "./quips.js";
import { MAX_COMMENT_LENGTH, type IssueState, type TimelineEntry } from "../shared/api.js";

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
  element.textContent = text;
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
  renderFilterQuery(state);

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

/**
 * Paints `is:issue state:<state>` as highlighted tokens rather than flat text,
 * which is how the real search field renders a parsed query.
 */
function renderFilterQuery(state: IssueState): void {
  const container = document.getElementById("filter-query");
  if (!container) return;

  const token = (className: string, text: string) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  };

  const pair = (key: string, value: string) => [
    token("filter-key", key),
    token("filter-delim", ":"),
    token("filter-value", value),
  ];

  container.replaceChildren(
    ...pair("is", "issue"),
    document.createTextNode(" "),
    ...pair("state", state),
  );
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

  // Your own comment is rendered the moment you post it, before the poll that
  // would have fetched it comes back. Tracking ids is what keeps that from
  // showing up twice — the poll is still holding a cursor from before it.
  const seen = new Set<string>();
  const append = (entry: TimelineEntry): void => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    timeline.appendChild(timelineRow(entry));
  };

  timeline.replaceChildren();
  for (const entry of issue.events) append(entry);

  let cursor = issue.cursor;
  const locked = requireElement("locked-notice");
  const composer = document.getElementById("add-comment");

  // The composer and the locked notice are the same slot: a live thread offers
  // a reply, a resolved one explains why it cannot (SPEC 9.3).
  const markClosed = () => {
    locked.hidden = false;
    if (composer) composer.hidden = true;
    badge.replaceChildren(stateBadge("closed"));
  };

  if (issue.state === "closed") {
    markClosed();
    return; // frozen forever: nothing to poll
  }

  if (composer) composer.hidden = false;
  initComposer(number, timeline, seen, markClosed);

  startPolling(async () => {
    const update = await fetchTimeline(number, cursor);
    for (const entry of update.events) append(entry);
    cursor = update.cursor;

    if (update.state === "closed") {
      markClosed();
      return false;
    }
    return true;
  }, { intervalMs: POLL_INTERVAL_MS });
}

// ------------------------------------------------------------------ composer

/**
 * Who you are posting as.
 *
 * The name lives in localStorage and is sent with each comment; the server only
 * takes it when the session is new, so this editor calls the rename endpoint
 * rather than relying on the next comment to carry a new name (SPEC 8).
 */
function initIdentity(): void {
  const session = getSession();
  const nameLabel = document.getElementById("identity-name");
  const avatar = document.getElementById("identity-avatar");
  const change = document.getElementById("identity-change");
  const edit = document.getElementById("identity-edit");
  const input = document.getElementById("identity-input");
  const save = document.getElementById("identity-save");
  const error = document.getElementById("identity-error");

  if (nameLabel) nameLabel.textContent = session.displayName;
  if (avatar) avatar.className = `avatar ${avatarClass(session.id)}`;

  if (!(input instanceof HTMLInputElement) || !edit || !change || !save) return;

  const commit = async (): Promise<void> => {
    const wanted = input.value.trim();
    if (wanted.length === 0) return;
    const current = getSession();

    try {
      const result = await putDisplayName({
        sessionId: current.id,
        token: current.token,
        displayName: wanted,
      });
      setDisplayName(result.displayName);
    } catch (failure) {
      // 404 means this session has never posted, so there is no server row to
      // rename yet. The name is still the visitor's to choose — the first
      // comment will establish it.
      if (failure instanceof ApiError && failure.status === 404) {
        setDisplayName(wanted);
      } else {
        if (error) {
          error.textContent =
            failure instanceof ApiError && failure.status === 400
              ? "Pick a different name — that one is reserved or too long."
              : "Could not change that right now.";
          error.hidden = false;
        }
        return;
      }
    }

    if (error) error.hidden = true;
    if (nameLabel) nameLabel.textContent = getSession().displayName;
    edit.hidden = true;
    change.hidden = false;
  };

  change.addEventListener("click", () => {
    input.value = getSession().displayName;
    edit.hidden = false;
    change.hidden = true;
    input.focus();
    input.select();
  });

  save.addEventListener("click", () => void commit());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
  });
}

function initComposer(
  issueNumber: number,
  timeline: HTMLElement,
  seen: Set<string>,
  onLocked: () => void,
): void {
  const textarea = document.getElementById("comment-body");
  const submit = document.getElementById("comment-submit");
  if (!(textarea instanceof HTMLTextAreaElement) || !(submit instanceof HTMLButtonElement)) {
    return;
  }

  initIdentity();

  let inFlight = false;

  /** The real composer greys Comment out until there is something to post. */
  const syncEnabled = (): void => {
    const length = textarea.value.trim().length;
    const usable = !inFlight && length > 0 && length <= MAX_COMMENT_LENGTH;
    submit.classList.toggle("disabled", !usable);
  };

  const send = async (): Promise<void> => {
    const body = textarea.value.trim();
    if (inFlight || body.length === 0 || body.length > MAX_COMMENT_LENGTH) return;

    const session = getSession();
    inFlight = true;
    syncEnabled();

    // Rendered immediately and faded, before the request goes out (SPEC 9.2).
    // Even at 50ms this beats a spinner, and it is what makes putting a queue
    // on the write path later change nothing the visitor can see.
    const pending = userCommentRow({
      seq: 0,
      id: "",
      kind: "comment",
      actor: session.id,
      body,
      meta: { name: session.displayName },
      createdAt: Date.now(),
      editedAt: null,
      deleted: false,
    });
    pending.classList.add("pending");
    timeline.appendChild(pending);
    textarea.value = "";
    pending.scrollIntoView({ block: "nearest" });

    try {
      const created = await postComment(issueNumber, {
        sessionId: session.id,
        token: session.token,
        displayName: session.displayName,
        body,
      });
      // Remember the id before swapping the row in: the poller is still holding
      // a cursor from before this comment and will fetch it on its next tick.
      seen.add(created.entry.id);
      pending.replaceWith(timelineRow(created.entry));
    } catch (failure) {
      const locked = failure instanceof ApiError && failure.status === 409;
      if (locked) {
        // The incident resolved while this was in flight (SPEC 9.3). The
        // composer is about to disappear, so the card stays as the only place
        // the text still exists rather than being silently discarded.
        markFailed(
          pending,
          "GitHub resolved the incident before this landed, so the thread locked and it was not posted.",
        );
        onLocked();
      } else {
        // Recoverable: drop the placeholder and give the text back, so it is in
        // the one place they would look to try again.
        pending.remove();
        textarea.value = body;
        flashError(submit, failure);
      }
    } finally {
      inFlight = false;
      syncEnabled();
    }
  };

  textarea.addEventListener("input", syncEnabled);
  submit.addEventListener("click", () => void send());
  // Cmd/Ctrl+Enter posts, the way the real composer does.
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  });

  syncEnabled();
}

/** Keeps a card on screen but marks it as never having been written. */
function markFailed(row: HTMLElement, message: string): void {
  row.classList.remove("pending");
  row.classList.add("failed");
  const note = document.createElement("div");
  note.className = "comment-failure";
  note.textContent = message;
  row.querySelector(".comment-box")?.appendChild(note);
}

/**
 * A transient write failure. The composer has no status line of its own, and
 * inventing one for the unhappy path is more chrome than the case deserves —
 * the button says what happened until the next keystroke.
 */
function flashError(submit: HTMLButtonElement, failure: unknown): void {
  const original = submit.textContent;
  submit.textContent =
    failure instanceof ApiError && failure.status === 403
      ? "Name is taken"
      : "Try again";
  window.setTimeout(() => {
    submit.textContent = original;
  }, 2_500);
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
 * The page is dense with controls that look interactive and are not: the header
 * icon cluster, the search box, the filter menus, the markdown toolbar. They are
 * <button>/<div>/<textarea>, so an href cannot cover them — send them to the
 * same place the dead links go.
 *
 * Delegated from the document rather than bound per element, so the controls
 * the timeline renders after boot (the per-comment kebabs) are covered too.
 *
 * `.live` is the opt-out, and it is why the composer is listed here at all: the
 * textarea and Comment button post for real now, while the toolbar around them
 * is still parody. Marking the three real controls is safer than listing the
 * dozen fake ones, since a new fake button then defaults to dead.
 */
const DEAD_CHROME_SELECTOR = [
  ".gh-header button",
  ".gh-header .search",
  ".issue-list-toolbar .filters button",
  ".sidebar-footer button",
  ".meta-section button",
  ".comment-actions button",
  ".issue-detail-header button",
  ".composer button:not(.live)",
  ".composer textarea:not(.live)",
].join(", ");

function wireDeadChrome(): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(DEAD_CHROME_SELECTOR)) location.href = "/503";
  });
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
