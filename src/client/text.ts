/**
 * Rendering untrusted text (SPEC 10.3).
 *
 * Incident bodies come from an external API and are rendered into a page we
 * serve, so they are untrusted regardless of how respectable the source looks.
 *
 * Every body in the recorded history contains exactly one kind of markup —
 * `<br>`, 228 times across 287 updates — and no entities and no markdown. So
 * rather than parse untrusted HTML and sanitise the result, this escapes
 * *everything* by building text nodes, then reconstructs the single tag we allow
 * as a real element. There is no parser to bypass.
 *
 * When user comments arrive (step 6) they will need genuine markdown handling —
 * `marked` plus `dompurify` against the real DOM. That is a different problem
 * with a different threat model; do not extend this function to cover it.
 */
const LINE_BREAK = /<\s*br\s*\/?\s*>/i;

export function renderBody(body: string): DocumentFragment {
  const fragment = document.createDocumentFragment();

  body.split(LINE_BREAK).forEach((segment, index) => {
    if (index > 0) fragment.appendChild(document.createElement("br"));
    const trimmed = index === 0 ? segment : segment.replace(/^\s+/, "");
    if (trimmed) fragment.appendChild(document.createTextNode(trimmed));
  });

  return fragment;
}
