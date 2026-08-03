/**
 * The octicon set, drawn to look like GitHub's rather than copied from it.
 *
 * Every glyph the site uses lives here so no two pages can drift, and so the
 * shapes stop being pasted into markup. Icons are decorative: the control
 * around them carries the label, and each one is hidden from assistive tech.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Overrides `fill: currentColor` — the state pill paints its glyph white. */
  fill?: string;
}

interface OcticonProps extends IconProps {
  /**
   * A few glyphs (the "@" of Mentioned) read far better drawn as strokes than
   * as a filled outline.
   */
  stroke?: boolean;
  children: ReactNode;
}

function Octicon({ size = 16, className, style, fill, stroke, children }: OcticonProps) {
  return (
    <svg
      className={cn("octicon", stroke && "octicon-stroke", className)}
      height={size}
      width={size}
      viewBox="0 0 16 16"
      style={style}
      fill={fill}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function pathIcon(name: string, d: string) {
  const Icon = (props: IconProps) => (
    <Octicon {...props}>
      <path d={d} />
    </Octicon>
  );
  Icon.displayName = name;
  return Icon;
}

// ------------------------------------------------------------- global header

export const ThreeBarsIcon = pathIcon(
  "ThreeBarsIcon",
  "M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z",
);

export const MarkGithubIcon = pathIcon(
  "MarkGithubIcon",
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z",
);

export const TriangleDownIcon = pathIcon(
  "TriangleDownIcon",
  "m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z",
);

export const SearchIcon = pathIcon(
  "SearchIcon",
  "M15.7 13.3l-3.81-3.83A5.93 5.93 0 0 0 13 6c0-3.31-2.69-6-6-6S1 2.69 1 6s2.69 6 6 6c1.3 0 2.48-.41 3.47-1.11l3.83 3.81c.19.2.45.3.7.3.25 0 .52-.09.7-.3a1 1 0 0 0 0-1.4zM3 6c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4z",
);

export const SparkleIcon = pathIcon(
  "SparkleIcon",
  "M9.5 1.25a.5.5 0 0 1 .47.33l.79 2.16 2.16.79a.5.5 0 0 1 0 .94l-2.16.79-.79 2.16a.5.5 0 0 1-.94 0l-.79-2.16-2.16-.79a.5.5 0 0 1 0-.94l2.16-.79.79-2.16a.5.5 0 0 1 .47-.33ZM4.5 8.75a.5.5 0 0 1 .47.33l.5 1.37 1.37.5a.5.5 0 0 1 0 .94l-1.37.5-.5 1.37a.5.5 0 0 1-.94 0l-.5-1.37-1.37-.5a.5.5 0 0 1 0-.94l1.37-.5.5-1.37a.5.5 0 0 1 .47-.33Z",
);

export const PlusIcon = pathIcon(
  "PlusIcon",
  "M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z",
);

export const GitPullRequestIcon = pathIcon(
  "GitPullRequestIcon",
  "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z",
);

export const InboxIcon = pathIcon(
  "InboxIcon",
  "M2.8 2.06A1.75 1.75 0 0 1 4.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25v-4.5c0-.101.02-.202.06-.295Zm1.61.44a.25.25 0 0 0-.23.152L1.887 8H4.75a.75.75 0 0 1 .6.3L6.625 10h2.75l1.275-1.7a.75.75 0 0 1 .6-.3h2.863L11.82 2.652a.25.25 0 0 0-.23-.152Z",
);

// -------------------------------------------------------- issues (list + nav)

export const IssueOpenedIcon = pathIcon(
  "IssueOpenedIcon",
  "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
);

export const IssueClosedIcon = pathIcon(
  "IssueClosedIcon",
  "M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5ZM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
);

/**
 * The state tabs draw the same two glyphs in two paths rather than one, so the
 * inner mark and the ring can take different fills.
 */
export function IssueOpenedSplitIcon(props: IconProps) {
  return (
    <Octicon {...props}>
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </Octicon>
  );
}

export function IssueClosedSplitIcon(props: IconProps) {
  return (
    <Octicon {...props}>
      <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </Octicon>
  );
}

export const PeopleIcon = pathIcon(
  "PeopleIcon",
  "M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.575-.729v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Z",
);

export const SmileyIcon = pathIcon(
  "SmileyIcon",
  "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879 2.773A.75.75 0 0 1 7.44 9.98a2.5 2.5 0 0 0 3.12 0 .75.75 0 1 1 .94 1.17 4 4 0 0 1-5 0 .75.75 0 0 1-.121-.377ZM5.75 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4.5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
);

export function MentionIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M10.6 8v1.4a1.9 1.9 0 0 0 3.8 0V8A6.4 6.4 0 1 0 11.3 13.4" />
    </Octicon>
  );
}

export const ClockIcon = pathIcon(
  "ClockIcon",
  "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z",
);

export const StackIcon = pathIcon(
  "StackIcon",
  "M7.122.392a1.75 1.75 0 0 1 1.756 0l5.003 2.902c.83.481.83 1.68 0 2.162L8.878 8.358a1.75 1.75 0 0 1-1.756 0L2.119 5.456a1.251 1.251 0 0 1 0-2.162ZM1.601 7.789l1.502.871-1.502.871a1.251 1.251 0 0 1 0-2.162Zm0 3.5 1.502.871-1.502.871a1.251 1.251 0 0 1 0-2.162Z",
);

export const ProjectIcon = pathIcon(
  "ProjectIcon",
  "M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v2.5h13v-2.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm0 4v8.5c0 .138.112.25.25.25H5v-8.75Zm5 0v8.75h7.75a.25.25 0 0 0 .25-.25v-8.5Z",
);

export const MilestoneIcon = pathIcon(
  "MilestoneIcon",
  "M7.75 0a.75.75 0 0 1 .75.75V3h3.634c.414 0 .814.147 1.13.414l2.07 1.75a1.75 1.75 0 0 1 0 2.672l-2.07 1.75a1.75 1.75 0 0 1-1.13.414H8.5v5.25a.75.75 0 0 1-1.5 0V10H2.75A1.75 1.75 0 0 1 1 8.25v-3.5C1 3.784 1.784 3 2.75 3H7V.75A.75.75 0 0 1 7.75 0Z",
);

/** The timeline's label events; the sidebar's Labels entry carries a dot too. */
export const TagIcon = pathIcon(
  "TagIcon",
  "M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Z",
);

export const TagDotIcon = pathIcon(
  "TagDotIcon",
  "M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775ZM4.5 5.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
);

export const CommentIcon = pathIcon(
  "CommentIcon",
  "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z",
);

export const SidebarCollapseIcon = pathIcon(
  "SidebarCollapseIcon",
  "M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25H5v-9Zm4.75 0v9h7.75a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25Z",
);

export const SortIcon = pathIcon(
  "SortIcon",
  "M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM12.25 2a.75.75 0 0 1 .75.75v8.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V2.75a.75.75 0 0 1 .75-.75Z",
);

// -------------------------------------------------------------- issue detail

export function CopyIcon(props: IconProps) {
  return (
    <Octicon {...props}>
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </Octicon>
  );
}

export const AlertIcon = pathIcon(
  "AlertIcon",
  "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm.936 4.328a.75.75 0 0 1 1.5 0v2.5a.75.75 0 0 1-1.5 0ZM8 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
);

export const PencilIcon = pathIcon(
  "PencilIcon",
  "M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758Z",
);

export const KebabIcon = pathIcon(
  "KebabIcon",
  "M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
);

export const BellIcon = pathIcon(
  "BellIcon",
  "M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM8 1.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.018.018 0 0 0-.003.01l.001.006c0 .002.002.004.004.006l.006.004.007.001h11.964l.007-.001.006-.004.004-.006.001-.007a.017.017 0 0 0-.003-.01l-1.703-2.554a1.75 1.75 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5Z",
);

export const LinkExternalIcon = pathIcon(
  "LinkExternalIcon",
  "M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z",
);

// ------------------------------------------------------------------ composer

export function QuoteIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <path d="M2 3v10M5.5 4.5h8M5.5 8h8M5.5 11.5h5" />
    </Octicon>
  );
}

export const LinkIcon = pathIcon(
  "LinkIcon",
  "M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z",
);

export function UnorderedListIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <path d="M6 4h8M6 8h8M6 12h8" />
      <circle cx="2.75" cy="4" r=".9" />
      <circle cx="2.75" cy="8" r=".9" />
      <circle cx="2.75" cy="12" r=".9" />
    </Octicon>
  );
}

export function OrderedListIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <path d="M6 4h8M6 8h8M6 12h8M2 2.6l1-.6v3.4M1.4 7.4h2l-2 2.6h2M1.4 11.4h2v1.3h-1.4h1.4v1.3h-2" />
    </Octicon>
  );
}

export function TaskListIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <rect x="1.6" y="2.6" width="4.4" height="4.4" rx="1" />
      <path d="M2.8 4.8 3.7 5.7 5 4.1M8 4.8h6M8 11.2h6" />
      <rect x="1.6" y="9" width="4.4" height="4.4" rx="1" />
    </Octicon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.5" />
      <path d="m2.6 11 3.2-3.4 2.4 2.4 2-1.8 3.2 3.2" />
      <circle cx="5.4" cy="5.6" r="1" />
    </Octicon>
  );
}

export function CrossReferenceIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <rect x="2.1" y="2.1" width="11.8" height="11.8" rx="2" />
      <path d="M6 6h4v4" />
      <path d="M10 6 6 10" />
    </Octicon>
  );
}

export function ReplyIcon(props: IconProps) {
  return (
    <Octicon {...props} stroke>
      <path d="M5.5 4 2 7.5 5.5 11" />
      <path d="M2 7.5h7a4 4 0 0 1 4 4v1" />
    </Octicon>
  );
}

export const BookIcon = pathIcon(
  "BookIcon",
  "M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z",
);

// ------------------------------------------------------------- profile menu

/** Two lobes and a point, for the one link on the site that wants money. */
export const HeartIcon = pathIcon(
  "HeartIcon",
  "M8 14C8 14 1.2 9.6 1.2 5.9C1.2 3.8 2.9 2.2 5 2.2C6.3 2.2 7.4 2.9 8 3.9C8.6 2.9 9.7 2.2 11 2.2C13.1 2.2 14.8 3.8 14.8 5.9C14.8 9.6 8 14 8 14Z",
);
