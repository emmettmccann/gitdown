/**
 * Signed in, github.com serves no footer on these views. gitdown still has to
 * carry the disclaimer on every page (SPEC 10.5), so it shrinks to one line
 * rather than disappearing.
 */
import { DeadLink } from "../ui/dead.js";

export function Footer() {
  return (
    <footer className="gh-footer">
      <div>
        A parody. Not affiliated with, endorsed by, or connected to GitHub or Microsoft. Incident
        text is quoted from <a href="https://www.githubstatus.com">githubstatus.com</a>.
      </div>
      <nav>
        <ul>
          <li>
            <DeadLink>Terms</DeadLink>
          </li>
          <li>
            <DeadLink>Privacy</DeadLink>
          </li>
          <li>
            <DeadLink>Security</DeadLink>
          </li>
          <li>
            <DeadLink>Status</DeadLink>
          </li>
          <li>
            <DeadLink>Docs</DeadLink>
          </li>
          <li>
            <a href="https://buymeacoffee.com/emmettmccann" rel="noopener">
              Pricing
            </a>
          </li>
          <li>
            <DeadLink>Contact</DeadLink>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
