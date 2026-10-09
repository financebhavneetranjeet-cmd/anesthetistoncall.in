export const EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL = `
  SELECT u.id AS clinicianId,
    MAX(a.end_at) AS availableUntil,
    CASE WHEN datetime(cp.availability_location_at) > datetime(CURRENT_TIMESTAMP, '-24 hours') THEN cp.availability_latitude END AS latitude,
    CASE WHEN datetime(cp.availability_location_at) > datetime(CURRENT_TIMESTAMP, '-24 hours') THEN cp.availability_longitude END AS longitude
  FROM users u
  JOIN clinician_profiles cp ON cp.user_id = u.id
  JOIN availability_slots a ON a.clinician_user_id = u.id
  WHERE u.role = 'anesthetist'
    AND u.status = 'verified'
    AND u.account_status = 'active'
    AND cp.verification_status = 'verified'
    AND a.status = 'available'
    AND datetime(a.start_at) <= CURRENT_TIMESTAMP
    AND datetime(a.end_at) > CURRENT_TIMESTAMP
  GROUP BY u.id
  ORDER BY availableUntil ASC
`;

function approximateCoordinate(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export function toEmergencyAvailabilityDto(row, match) {
  const latitude = approximateCoordinate(row.latitude);
  const longitude = approximateCoordinate(row.longitude);
  return {
    status: "Available Now",
    availableUntil: row.availableUntil,
    approximateLocation:
      latitude === null || longitude === null
        ? null
        : { latitude, longitude, precision: "approximate" },
    ranking: match.score,
    rating: match.metrics.ratingCount ? match.metrics.rating : null,
    ratingCount: match.metrics.ratingCount,
  };
}
