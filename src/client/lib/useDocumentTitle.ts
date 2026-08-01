import { useEffect } from "react";

/**
 * The tab title, which used to be a static `<title>` per HTML page.
 *
 * One shell now serves every route, so the title is a property of the route
 * rather than of the document, and each page has to set its own. The effect
 * re-runs on change, which is what makes the issue page pick up the real title
 * once the thread has loaded.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
