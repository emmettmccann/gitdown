-- The issues list orders by open date, not by last activity.
--
-- Issue numbers are handed out oldest-first during reconcile, so `number DESC`
-- *is* newest-opened-first, and it costs no extra column to sort on. It also
-- makes pagination stable: an issue that gets a new comment mid-read no longer
-- jumps to page 1 and shifts every later page by one.
--
-- `number` is the INTEGER PRIMARY KEY, so an index keyed on state carries it as
-- the rowid; naming it here keeps the ordering explicit rather than relying on
-- a reverse scan happening to fall out of the query planner.
CREATE INDEX idx_issues_state_number ON issues (state, number DESC);

-- Nothing orders by updated_at any more, and the only query that filters on
-- state now uses the index above.
DROP INDEX idx_issues_state_updated;
