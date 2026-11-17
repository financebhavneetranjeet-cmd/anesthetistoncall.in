const history = `u.id AS userId, a.user_id IS NOT NULL AS reregistered, a.blocking_reason AS blockingReason, a.archived_by_reregistration AS previouslyBlocked`;
const activePending = `u.status = 'pending' AND u.account_status = 'active'
  AND NOT EXISTS (SELECT 1 FROM mobile_security_bans b WHERE b.mobile = u.mobile AND b.cleared_at IS NULL)`;

export const pendingClinicians = `SELECT cp.id, u.full_name AS fullName, u.role, u.mobile, u.email,
  cp.state_council AS stateCouncil, cp.registration_number AS registrationNumber, cp.qualification,
  cp.city, cp.created_at AS createdAt, cp.pmc_verification_status AS pmcVerificationStatus, ${history},
  (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id) AS documentCount,
  (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id AND vd.document_type = 'pmc_certificate') AS pmcCertificateCount
  FROM clinician_profiles cp JOIN users u ON u.id = cp.user_id
  LEFT JOIN archived_accounts a ON a.user_id = u.previous_account_id
  WHERE cp.verification_status = 'pending' AND ${activePending}
  ORDER BY cp.created_at ASC`;

export const pendingHospitals = `SELECT h.id, h.name, COALESCE(h.facility_type,'hospital') AS facilityType,
  h.address, h.city, h.google_place_id AS googlePlaceId, h.approval_status AS approvalStatus,
  h.created_at AS createdAt, u.full_name AS contactName, u.mobile, u.email, ${history},
  (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id AND vd.document_type = 'facility_registration') AS documentCount
  FROM hospitals h JOIN users u ON u.id = h.owner_user_id
  LEFT JOIN archived_accounts a ON a.user_id = u.previous_account_id
  WHERE h.approval_status = 'pending' AND ${activePending}
  ORDER BY h.created_at ASC`;
