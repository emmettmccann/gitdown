import { Route, Routes } from "react-router";
import { IssuePage } from "./routes/IssuePage.js";
import { IssuesPage } from "./routes/IssuesPage.js";
import { OopsPage } from "./routes/OopsPage.js";

/**
 * Three routes, and they line up with what the Worker will serve the shell for.
 *
 * `/issues/:issueNumber` is a real URL rather than a query parameter because
 * that is what GitHub's are; the Worker returns this same shell for it (see
 * `run_worker_first` in wrangler.jsonc). `/503` and the catch-all both land on
 * the unicorn, which the Worker has already answered with the matching status
 * code — 503 for a decorative link, 404 for a genuine miss.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<IssuesPage />} />
      <Route path="/issues/:issueNumber" element={<IssuePage />} />
      <Route path="/503" element={<OopsPage />} />
      <Route path="*" element={<OopsPage />} />
    </Routes>
  );
}
