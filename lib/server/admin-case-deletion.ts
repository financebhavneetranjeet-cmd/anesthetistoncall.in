// Alias c is required. Active assignments are never deletable just because
// their dashboard visibility window expired. Terminal records are retained.
export const ADMIN_CASE_DELETABLE_SQL = `(c.status IN ('completed','cancelled') OR (
  c.status IN ('open','replacement_required')
  AND c.assigned_clinician_user_id IS NULL
  AND datetime(COALESCE(c.approved_at,c.created_at), '+12 hours') <= CURRENT_TIMESTAMP
))`;
