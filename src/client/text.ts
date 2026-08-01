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
 * User comments are a different problem with a different threat model, and are
 * handled by `renderUserBody` below rather than by extending this one.
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

/**
 * A comment someone typed.
 *
 * Deliberately not markdown. The composer says Markdown because the real one
 * does, and the toolbar above it is parody chrome, but rendering a markdown
 * subset safely is its own piece of work (SPEC 10.3) and belongs with the rest
 * of the abuse controls. Until then every character a visitor types becomes a
 * text node and nothing else: newlines are the only structure, and there is no
 * parser here to get wrong.
 */
export function renderUserBody(body: string): DocumentFragment {
  const fragment = document.createDocumentFragment();

  body.split("\n").forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement("br"));
    if (line) fragment.appendChild(document.createTextNode(line));
  });

  return fragment;
}
