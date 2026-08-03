/**
 * Rendering untrusted text (SPEC 10.3).
 *
 * Incident bodies come from an external API and are rendered into a page we
 * serve, so they are untrusted regardless of how respectable the source looks.
 *
 * The old DOM version escaped everything by building text nodes by hand. React
 * does that by construction — a string child is always text, never markup — so
 * the guarantee now rests on one rule instead of a convention: nothing in this
 * codebase calls `dangerouslySetInnerHTML`. The single tag we allow is emitted
 * as a real `<br>` element rather than parsed out of the string, so there is
 * still no parser here to bypass.
 *
 * User comments are a different problem with a different threat model, and are
 * handled by `renderUserBody` below rather than by extending this one.
 */
import { Fragment, type ReactNode } from "react";

const LINE_BREAK = /<\s*br\s*\/?\s*>/i;

/**
 * Segments are positional and never reordered, so the index is a stable key.
 */
function joinWithBreaks(segments: string[]): ReactNode {
  return segments.map((segment, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {segment}
    </Fragment>
  ));
}

export function renderBody(body: string): ReactNode {
  // Every body in the recorded history contains exactly one kind of markup —
  // `<br>`, 228 times across 287 updates — and no entities and no markdown.
  return joinWithBreaks(
    body.split(LINE_BREAK).map((segment, index) => (index === 0 ? segment : segment.replace(/^\s+/, ""))),
  );
}

/**
 * A comment someone typed.
 *
 * Deliberately not markdown. The composer says Markdown because the real one
 * does, and the toolbar above it is parody chrome, but rendering a markdown
 * subset safely is its own piece of work (SPEC 10.3) and belongs with the rest
 * of the abuse controls. Until then newlines are the only structure a comment
 * gets, and every other character is text.
 */
export function renderUserBody(body: string): ReactNode {
  return joinWithBreaks(body.split("\n"));
}
