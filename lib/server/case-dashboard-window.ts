// Publication starts at approval; legacy and immediately published cases fall back to creation.
// Filtering lists preserves case details, assignments, payments and audit history.
export const CASE_DASHBOARD_WINDOW_SQL =
  "datetime(COALESCE(c.approved_at, c.created_at)) > datetime('now', '-12 hours')";
