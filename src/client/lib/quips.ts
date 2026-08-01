/**
 * Copy for the broken-link page.
 *
 * The funniest ones borrow githubstatus.com's own incident-update register and
 * point it at this site, which is the joke the whole project is built on.
 */
export const QUIPS: readonly string[] = [
  "This entire site is a joke about how buggy GitHub is. You really thought the links would work?",
  "We are investigating reports of degraded availability for this page.",
  "This page has been mitigated. We are continuing to monitor for recovery.",
  "This incident has been resolved. This page has not.",
  "All systems operational, except this one.",
  "This page is experiencing elevated error rates. The rate is 100%.",
  "You've found a thirteenth component. It is not operational.",
  "Someone opened an issue about this link. It's still open.",
  "This feature is on the roadmap. The roadmap is also this page.",
  "It worked in staging. There is no staging.",
  "Works on my machine.",
  "It's not a bug, it's an unimplemented feature.",
  "Have you tried refreshing? It won't help, but it will feel productive.",
  "We could have built this page, or we could have written jokes for it. We made our choice.",
  "Rolling back… rolling back… rolling back…",
  "This link is a monument to unfinished work.",
  "Blame the intern. There is no intern.",
  "Root cause: the link goes nowhere. Remediation: none planned.",
  "A postmortem for this page will be published never.",
  "Scheduled maintenance for this page begins whenever and ends never.",
];

export function randomQuip(pick: () => number = Math.random): string {
  return QUIPS[Math.floor(pick() * QUIPS.length)] ?? QUIPS[0]!;
}
