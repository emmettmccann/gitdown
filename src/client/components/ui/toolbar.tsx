/**
 * Toolbars, on Radix's primitive.
 *
 * The markdown strip and the issue-list filter row are both a dozen buttons in
 * a line, and hand-written that is a dozen tab stops to get past. Radix gives
 * them `role="toolbar"` and a roving tabindex — one stop for the group, arrow
 * keys within it — which is what the real controls do and what the hand-built
 * markup never did. None of it is visible, so the look is unchanged.
 */
import * as ToolbarPrimitive from "@radix-ui/react-toolbar";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.js";

export function Toolbar({ className, ...props }: ComponentProps<typeof ToolbarPrimitive.Root>) {
  return <ToolbarPrimitive.Root className={className} {...props} />;
}

export function ToolbarButton({
  className,
  type = "button",
  ...props
}: ComponentProps<typeof ToolbarPrimitive.Button>) {
  return <ToolbarPrimitive.Button className={className} type={type} {...props} />;
}

/**
 * The hairline between toolbar groups. It was a `<span class="sep">`; as a
 * separator it also announces itself, and `.md-toolbar .sep` sizes it either
 * way because both are flex items with an explicit width and height.
 */
export function ToolbarSeparator({
  className,
  ...props
}: ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return <ToolbarPrimitive.Separator className={cn("sep", className)} {...props} />;
}
