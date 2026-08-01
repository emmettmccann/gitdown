/**
 * DOM construction for issue rows and timeline events.
 *
 * Everything is built with `document.createElement` and text nodes rather than
 * template strings assigned to `innerHTML`. Titles, labels and bodies all
 * originate upstream, so there is no path here where untrusted text is ever
 * interpreted as markup (SPEC 10.3).
 */
import type { IssueSummary, TimelineEntry } from "../shared/api.js";
import { avatarClass } from "./session.js";
import { renderBody, renderUserBody } from "./text.js";
import { exactTime, humanizeStatus, relativeTime } from "./time.js";

export const BOT_ACTOR = "githubstatus";

const ICON = {
  open: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  closed:
    "M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5ZM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  label:
    "M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Z",
  alert:
    "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm.936 4.328a.75.75 0 0 1 1.5 0v2.5a.75.75 0 0 1-1.5 0ZM8 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
  pencil:
    "M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758Z",
  kebab:
    "M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
} as const;

function svg(path: string, size = 16): SVGSVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  element.setAttribute("class", "octicon");
  element.setAttribute("height", String(size));
  element.setAttribute("width", String(size));
  element.setAttribute("viewBox", "0 0 16 16");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  element.appendChild(shape);
  return element;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Impact labels get severity colours; component labels are neutral. */
function labelClass(label: string): string {
  switch (label) {
    case "impact:critical":
      return "label-chip label-red";
    case "impact:major":
      return "label-chip label-orange";
    case "impact:minor":
      return "label-chip label-yellow";
    case "impact:none":
      return "label-chip label-gray";
    default:
      return "label-chip label-blue";
  }
}

export function labelChip(label: string): HTMLElement {
  const chip = el("span", labelClass(label), label);
  chip.title = label.startsWith("impact:")
    ? `Incident impact: ${label.slice("impact:".length)}`
    : `Affected component: ${label}`;
  return chip;
}

function timeSpan(at: number, prefix = ""): HTMLElement {
  const span = el("span", "when", `${prefix}${relativeTime(at)}`);
  span.title = exactTime(at);
  return span;
}

export function issueRow(issue: IssueSummary): HTMLLIElement {
  const row = el("li", "issue-row");

  const icon = el("span", "state-icon");
  const glyph = svg(issue.state === "open" ? ICON.open : ICON.closed);
  glyph.setAttribute(
    "style",
    `color:var(--color-${issue.state === "open" ? "open" : "closed"}-bg)`,
  );
  icon.appendChild(glyph);
  row.appendChild(icon);

  const body = el("div", "issue-body");

  const title = el("a", "issue-title", issue.title);
  title.href = `/issues/${issue.number}`;
  body.appendChild(title);

  for (const label of issue.labels) body.appendChild(labelChip(label));

  const opened = issue.state === "open" ? "opened" : "closed";
  const at = issue.state === "open" ? issue.createdAt : (issue.resolvedAt ?? issue.updatedAt);
  const meta = el("div", "issue-meta");
  meta.append(
    document.createTextNode(`#${issue.number} · ${BOT_ACTOR} ${opened} `),
    timeSpan(at),
  );
  if (issue.commentCount > 0) {
    meta.append(
      document.createTextNode(
        ` · ${issue.commentCount} comment${issue.commentCount === 1 ? "" : "s"}`,
      ),
    );
  }
  body.appendChild(meta);

  row.appendChild(body);
  return row;
}

interface Author {
  name: string;
  /** Bot rows link out to the source; a visitor has nowhere to link to. */
  href?: string;
  bot?: boolean;
  avatar: string;
}

/**
 * The comment card, shared by bot updates and visitor comments.
 *
 * They differ only in who the header names and how the body is rendered — the
 * card, the kebab and the timestamp are the same object, and keeping them one
 * function is what stops the two drifting apart visually.
 */
function commentCard(
  entry: TimelineEntry,
  author: Author,
  prefix: string,
  body: DocumentFragment | HTMLElement,
): HTMLElement {
  const row = el("div", "timeline-row");
  const box = el("div", "timeline-comment comment-box");

  const header = el("div", "comment-header");
  // Signed in, the avatar is inside the card next to the name rather than out
  // in the timeline gutter.
  const who = el("div");
  who.appendChild(el("span", `avatar ${author.avatar}`));

  if (author.href) {
    const name = el("a", "who", author.name);
    name.href = author.href;
    who.appendChild(name);
  } else {
    who.appendChild(el("span", "who", author.name));
  }
  if (author.bot) who.appendChild(el("span", "role-pill bot", "bot"));

  who.appendChild(timeSpan(entry.createdAt, prefix));
  if (entry.editedAt !== null) who.appendChild(el("span", "when", " · edited"));
  header.appendChild(who);

  // Dead chrome, wired to the unicorn page with everything else.
  const actions = el("div", "comment-actions");
  const kebab = el("button", "icon-btn");
  kebab.type = "button";
  kebab.setAttribute("aria-label", "Comment options");
  kebab.appendChild(svg(ICON.kebab));
  actions.appendChild(kebab);
  header.appendChild(actions);

  box.appendChild(header);

  const bodyWrap = el("div", "comment-body");
  bodyWrap.appendChild(body);
  box.appendChild(bodyWrap);

  row.appendChild(box);
  return row;
}

/** A bot comment: the status update itself. */
function statusUpdateRow(entry: TimelineEntry): HTMLElement {
  const status = typeof entry.meta?.["status"] === "string" ? entry.meta["status"] : null;

  let body: HTMLElement;
  if (entry.deleted) {
    body = el("em", undefined, "This comment was removed upstream.");
  } else {
    body = el("p");
    body.appendChild(renderBody(entry.body ?? ""));
  }

  return commentCard(
    entry,
    { name: BOT_ACTOR, href: "https://www.githubstatus.com", bot: true, avatar: "avatar-c2" },
    status ? `${humanizeStatus(status)} · ` : "commented ",
    body,
  );
}

/**
 * A comment somebody wrote.
 *
 * The display name is read from the row's own meta rather than looked up, so it
 * is whatever the author was called when they posted — see the note on
 * `writeComment`. Falling back to the session id keeps a row with unexpected
 * meta rendering as *something* instead of an empty header.
 */
export function userCommentRow(entry: TimelineEntry): HTMLElement {
  const name = typeof entry.meta?.["name"] === "string" ? entry.meta["name"] : entry.actor;

  let body: HTMLElement;
  if (entry.deleted) {
    body = el("em", undefined, "This comment was removed.");
  } else {
    body = el("p");
    body.appendChild(renderUserBody(entry.body ?? ""));
  }

  return commentCard(
    entry,
    { name, avatar: avatarClass(entry.actor) },
    "commented ",
    body,
  );
}

/**
 * A non-comment timeline row: the small icon-plus-sentence kind.
 *
 * `badge` fills the icon the way the state pill at the top of the page is
 * filled — reserved for opening and closing, so those two read as the events
 * that bracket the thread rather than as more label churn.
 */
function eventRow(
  icon: string,
  build: (target: HTMLElement) => void,
  badge?: "state-open" | "state-closed",
): HTMLElement {
  const row = el("div", "timeline-row event");
  const iconWrap = el("div", badge ? `timeline-icon ${badge}` : "timeline-icon");
  iconWrap.appendChild(svg(icon, 14));
  row.appendChild(iconWrap);

  const text = el("div", "timeline-event-text");
  build(text);
  row.appendChild(text);
  return row;
}

function actor(): HTMLElement {
  return el("strong", undefined, BOT_ACTOR);
}

function metaString(entry: TimelineEntry, key: string): string {
  const value = entry.meta?.[key];
  return typeof value === "string" ? value : "";
}

export function timelineRow(entry: TimelineEntry): HTMLElement {
  switch (entry.kind) {
    case "status_update":
      return statusUpdateRow(entry);

    case "comment":
      return userCommentRow(entry);

    case "opened":
      return eventRow(
        ICON.open,
        (text) => {
          text.append(actor(), document.createTextNode(" opened this issue "), timeSpan(entry.createdAt));
        },
        "state-open",
      );

    case "component_changed":
      return eventRow(ICON.alert, (text) => {
        const to = humanizeStatus(metaString(entry, "to"));
        text.append(
          el("strong", undefined, metaString(entry, "component")),
          document.createTextNode(` went from ${humanizeStatus(metaString(entry, "from"))} to ${to} `),
          timeSpan(entry.createdAt),
        );
      });

    case "label_added":
    case "label_removed":
      return eventRow(ICON.label, (text) => {
        text.append(
          actor(),
          document.createTextNode(entry.kind === "label_added" ? " added " : " removed "),
          labelChip(metaString(entry, "label")),
          document.createTextNode(" "),
          timeSpan(entry.createdAt),
        );
      });

    case "renamed":
      return eventRow(ICON.pencil, (text) => {
        text.append(
          actor(),
          document.createTextNode(" changed the title "),
          el("del", undefined, metaString(entry, "from")),
          document.createTextNode(" "),
          el("ins", undefined, metaString(entry, "to")),
          document.createTextNode(" "),
          timeSpan(entry.createdAt),
        );
      });

    case "closed":
      return eventRow(
        ICON.closed,
        (text) => {
          text.append(actor(), document.createTextNode(" closed this as resolved "), timeSpan(entry.createdAt));
        },
        "state-closed",
      );

    case "reopened":
      return eventRow(
        ICON.open,
        (text) => {
          text.append(actor(), document.createTextNode(" reopened this "), timeSpan(entry.createdAt));
        },
        "state-open",
      );

    default:
      // An event kind the client does not know about is a deploy-skew problem,
      // not a reason to blank the thread.
      return eventRow(ICON.alert, (text) => {
        text.append(actor(), document.createTextNode(` ${entry.kind} `), timeSpan(entry.createdAt));
      });
  }
}

export function stateBadge(state: string): HTMLElement {
  const badge = el("div", state === "open" ? "state-badge" : "state-badge closed");
  const glyph = svg(state === "open" ? ICON.open : ICON.closed);
  glyph.setAttribute("fill", "#fff");
  badge.append(glyph, document.createTextNode(state === "open" ? " Open" : " Closed"));
  return badge;
}
