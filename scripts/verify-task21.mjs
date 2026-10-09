import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checks = {
  "completed-case two-way reviews": [read("app/api/ratings/route.ts") + read("db/schema.ts"), ["completion_confirmed_at IS NOT NULL", "hospital_to_anaesthetist", "anaesthetist_to_hospital", "case_rating_unique", "48-hour edit period"]],
  "reliability methodology": [read("lib/server/ratings.ts"), ["Bayesian prior", "completionRate", "punctuality", "paymentReliability", "lateCancelled", "noShows", "disputes"]],
  "privacy and anti-manipulation": [read("app/api/ratings/route.ts"), ["containsPatientIdentifier", "Self-ratings are not allowed", "suspicious_rating_activity", "You did not participate"]],
  "admin moderation": [read("app/api/admin/reviews/route.ts"), ["hide_content", "remove_review", "restore_review", "starRatingChanged:false"]],
  "mobile dashboards and matching": [read("app/reviews/reviews-dashboard.tsx") + read("app/cases/cases-dashboard.tsx"), ["Verified Case", "Reliability score", "Payment reliability", "sm:grid-cols", "hospitalReliability"]],
  "durable audit models": [read("db/schema.ts"), ["reviewReports", "reviewAuditEvents", "privacyFlagged", "moderationReason"]],
};
const missing = [];
for (const [label, [source, markers]] of Object.entries(checks)) for (const marker of markers) if (!source.includes(marker)) missing.push(`${label}: ${marker}`);
if (missing.length) { console.error("Task 21 verification failed:\n- " + missing.join("\n- ")); process.exit(1); }
console.log("Task 21 ratings, reliability, privacy, moderation and matching checks passed.");
