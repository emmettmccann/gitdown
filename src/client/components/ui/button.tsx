/**
 * The button, in the shadcn/ui shape: variants declared with CVA, `asChild`
 * provided by Radix's Slot.
 *
 * The variants are the classes the stylesheet already defines rather than
 * utility strings, which is the whole reason this can exist without Tailwind —
 * `variant="primary"` resolves to `btn btn-primary`, and the GitHub look is
 * untouched. `asChild` is what lets a link wear a button: the pager and "New
 * issue" are anchors that have to look like `.btn`, and rendering a `<button>`
 * with an onClick for them would break middle-click, copy-link, and the status
 * bar.
 */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.js";

const buttonVariants = cva("", {
  variants: {
    variant: {
      /** `.btn`: the bordered grey default. */
      default: "btn",
      /** The green call to action. */
      primary: "btn btn-primary",
      /** A square glyph button — header chrome, comment kebabs. */
      icon: "icon-btn",
      /** Text that behaves like a link but has to be a button. */
      link: "btn-link",
      /** No class of its own; the caller's own class does the work. */
      bare: "",
    },
    size: {
      default: "",
      sm: "btn-sm",
      block: "btn-block",
    },
    /** Icon buttons that open a menu carry an outline; destinations do not. */
    bordered: {
      true: "bordered",
      false: "",
    },
  },
  defaultVariants: { variant: "default", size: "default", bordered: false },
});

export interface ButtonProps
  extends ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  bordered,
  asChild = false,
  type,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        buttonVariants({ variant, size, bordered }),
        // Only `.btn-primary.disabled` is styled, so this is inert elsewhere.
        disabled && "disabled",
        className,
      )}
      // A `<button>` inside a form defaults to `type="submit"`, and the
      // composer is a form surrounded by parody chrome that must never submit
      // it. Every button here is inert unless it says otherwise.
      type={asChild ? undefined : (type ?? "button")}
      disabled={disabled}
      {...props}
    />
  );
}

export { buttonVariants };
