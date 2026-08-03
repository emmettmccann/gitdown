import { Link } from "react-router";
import type { IssueState } from "../../../shared/api.js";
import { Button } from "../ui/button.js";

interface PagerProps {
  state: IssueState;
  page: number;
  hasMore: boolean;
}

/**
 * Newer/Older, as links.
 *
 * `.pager:empty` hides the row when neither applies, so the container is always
 * rendered and the stylesheet decides whether it takes up space.
 */
export function Pager({ state, page, hasMore }: PagerProps) {
  const pageLink = (label: string, target: number) => (
    <Button asChild>
      <Link to={`/?state=${state}&page=${target}`}>{label}</Link>
    </Button>
  );

  return (
    <div className="pager">
      {page > 1 && pageLink("← Newer", page - 1)}
      {hasMore && pageLink("Older →", page + 1)}
    </div>
  );
}
