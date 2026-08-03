import type { IssueState } from "../../../shared/api.js";
import { DeadButton } from "../ui/dead.js";
import { SearchIcon } from "../ui/icons.js";

/**
 * The search field, showing `is:issue state:<state>` as parsed tokens rather
 * than flat text — keys plain, ":" muted, values on a tinted chip, which is how
 * the real field paints a query it understands.
 *
 * It reflects the query; it does not accept one. Typing a filter is dead
 * chrome, so this is a read-only textbox rather than an input.
 */
function Token({ pair: [key, value] }: { pair: [string, string] }) {
  return (
    <>
      <span className="filter-key">{key}</span>
      <span className="filter-delim">:</span>
      <span className="filter-value">{value}</span>
    </>
  );
}

export function FilterBar({ state }: { state: IssueState }) {
  return (
    <div className="filter-bar">
      <div className="filter-input">
        <div
          className="filter-query"
          role="textbox"
          aria-readonly="true"
          aria-label="Search issues"
        >
          <Token pair={["is", "issue"]} /> <Token pair={["state", state]} />
        </div>
        <DeadButton className="filter-submit" aria-label="Search">
          <SearchIcon />
        </DeadButton>
      </div>
    </div>
  );
}
