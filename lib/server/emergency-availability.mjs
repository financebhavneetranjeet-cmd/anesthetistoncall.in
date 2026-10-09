export const EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL = `
  SELECT u.id AS clinicianId,
    cp.available_until AS availableUntil,
    cp.availability_latitude AS latitude,
    cp.availability_longitude AS longitude
  FROM users u
  JOIN clinician_profiles cp ON cp.user_id = u.id
  WHERE u.role = 'anesthetist'
    AND u.status = 'verified'
    AND u.account_status = 'active'
    AND cp.verification_status = 'verified'
    AND cp.availability_status = 'available'
    AND cp.available_until IS NOT NULL
    AND datetime(cp.available_until) > CURRENT_TIMESTAMP
    AND datetime(cp.available_until) <= datetime(CURRENT_TIMESTAMP, '+24 hours')
  ORDER BY cp.available_until ASC
`;

function approximateCoordinate(value) {
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
