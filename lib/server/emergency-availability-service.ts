import { env } from "cloudflare:workers";
import { scoreMatch } from "@/lib/server/performance";
import {
  EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL,
  toEmergencyAvailabilityDto,
} from "@/lib/server/emergency-availability.mjs";

type EligibleRow = {
  clinicianId: string;
  availableUntil: string;
  latitude: string | null;
  longitude: string | null;
};

export type EmergencyAvailabilityDto = {
  status: "Available Now";
  availableUntil: string;
  approximateLocation: { latitude: number; longitude: number; precision: "approximate" } | null;
  ranking: number;
  rating: number | null;
  ratingCount: number;
};

export async function getEmergencyAvailableAnaesthetists(options: { includeRanking?: boolean } = {}) {
  if (!env.DB) return [] as EmergencyAvailabilityDto[];
  const rows = await env.DB.prepare(EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL).all<EligibleRow>();
  if (options.includeRanking === false) return rows.results.map((row) => toEmergencyAvailabilityDto(row, { score: 0, metrics: { rating: 0, ratingCount: 0 } })) as EmergencyAvailabilityDto[];
  const available = await Promise.all(rows.results.map(async (row) => {
    const match = await scoreMatch({ clinicianId: row.clinicianId, isEmergency: true, available: true, etaMinutes: null, offeredFeePaise: 100, bidFeePaise: null });
    return toEmergencyAvailabilityDto(row, match) as EmergencyAvailabilityDto;
  }));
  return available.sort((a, b) => b.ranking - a.ranking || (b.rating ?? 0) - (a.rating ?? 0) || a.availableUntil.localeCompare(b.availableUntil));
}
