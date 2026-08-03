/**
 * Popovers, on Radix's primitive.
 *
 * The header's account menu is built on this rather than on `DropdownMenu`,
 * which is otherwise the obvious fit for a menu hanging off an avatar. The
 * deciding detail is that ours contains a text field: `DropdownMenu` puts
 * `role="menu"` on its content, and a text input inside a menu is not a thing
 * the role allows — it also swallows typing into its own typeahead. A popover
 * makes no claim about its contents, so the links stay links and the rename
 * field stays a field.
 *
 * What Radix is here for either way: positioning with collision detection,
 * focus moving in and back out again, Escape, and dismissal on an outside
 * click.
 */
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  align = "end",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} {...props} />
    </PopoverPrimitive.Portal>
  );
}
