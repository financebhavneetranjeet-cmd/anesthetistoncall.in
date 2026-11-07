import { EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL } from "./emergency-availability.mjs";

// One audience for in-app replacement alerts and user-composed phone SMS.
export async function replacementRecipients(db: D1Database, requesterId: string, city: string) {
  const rows = await db.prepare(`SELECT u.id,u.full_name AS name,u.mobile FROM (${EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL}) a
    JOIN users u ON u.id=a.clinicianId JOIN clinician_profiles cp ON cp.user_id=u.id
    WHERE u.id<>? AND lower(trim(cp.city))=lower(trim(?)) ORDER BY u.id`).bind(requesterId, city).all<{id:string;name:string;mobile:string}>();
  const requester = await db.prepare("SELECT mobile FROM users WHERE id=?").bind(requesterId).first<{mobile:string}>();
  const ownDigits = requester?.mobile.replace(/\D/g, "") ?? "";
  const ownLocal = ownDigits.length === 12 && ownDigits.startsWith("91") ? ownDigits.slice(2) : ownDigits;
  const seen = new Set<string>([ownLocal]);
  return rows.results.flatMap(row => {
    const digits = row.mobile.replace(/\D/g, "");
    const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local) || seen.has(local)) return [];
    seen.add(local);
    return [{ id: row.id, name: row.name, number: `+91${local}` }];
  });
}
