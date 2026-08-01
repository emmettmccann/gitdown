/**
 * What every page has above and below it.
 *
 * The three views differ only in what sits between the tab strip and the
 * footer, so the layout of that middle part stays with the route rather than
 * being guessed at here.
 */
import type { ReactNode } from "react";
import { Footer } from "./Footer.js";
import { GlobalHeader } from "./GlobalHeader.js";
import { RepoTabs } from "./RepoTabs.js";

interface AppShellProps {
  children: ReactNode;
  issuesCount?: string;
}

export function AppShell({ children, issuesCount }: AppShellProps) {
  return (
    <>
      <GlobalHeader />
      <RepoTabs issuesCount={issuesCount} />
      {children}
      <Footer />
    </>
  );
}
