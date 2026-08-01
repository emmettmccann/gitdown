/**
 * Chrome that looks interactive and is not.
 *
 * The page is dense with it — the header icon cluster, the search box, the
 * filter menus, the markdown toolbar, the per-comment kebabs — and all of it
 * lands on the unicorn page. The old client caught the lot with one delegated
 * click handler and a list of CSS selectors, which meant a control was dead
 * because of where it sat in the DOM. Here it is dead because it says so, which
 * survives being moved, renamed, or restyled.
 *
 * Everything below leaves the page for real rather than routing in the client.
 * The Worker answers `/503` with the status code it is named after, and a
 * client-side navigation would render the joke behind a `200`.
 */
import type { ComponentProps, KeyboardEvent } from "react";
import { Button, type ButtonProps } from "./button.js";

export const DEAD_HREF = "/503";

export function goDead(): void {
  window.location.assign(DEAD_HREF);
}

/**
 * `variant="bare"` by default: most dead controls are styled by the container
 * they sit in (`.md-toolbar button`, `.filters button`) rather than by a class
 * of their own.
 */
export function DeadButton({ variant = "bare", ...props }: Omit<ButtonProps, "onClick">) {
  return <Button variant={variant} {...props} onClick={goDead} />;
}

/** A plain anchor, deliberately — see the note above about `/503`. */
export function DeadLink(props: Omit<ComponentProps<"a">, "href">) {
  return <a href={DEAD_HREF} {...props} />;
}

/**
 * For the handful of dead controls that are neither: the header search field is
 * a `div` with `role="button"`, because making it an anchor would give it the
 * link colour and a hover underline that the real one does not have.
 */
export const deadHandlers = {
  onClick: goDead,
  onKeyDown: (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goDead();
    }
  },
} as const;
