/**
 * Class-name joiner, the `cn` helper every shadcn/ui component is written
 * against.
 *
 * Upstream this is `twMerge(clsx(...))`, because Tailwind utilities conflict
 * with each other and the later one has to win. gitdown keeps its hand-built
 * GitHub stylesheet instead of Tailwind, so there is nothing to de-conflict and
 * the merge step would be dead weight — but the call shape stays the same, so
 * dropping a shadcn component in later needs no edits.
 */
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
