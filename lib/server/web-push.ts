import { env } from "cloudflare:workers";
import { replacementRecipients } from "./replacement-recipients";
import webPush from "web-push";
import { isAdminMobile } from "./login";

type PushPayload = { title: string; body: string; url: string; tag: string };

export async function sendWebPush(userId: string, payload: PushPayload, notificationId?: string, mirrorToAdmin = true) {
  if (mirrorToAdmin) await publishAdminNotice(payload, `event:${payload.tag}`, null, userId);
  const summary = { attempted: 0, accepted: 0, failed: 0, expired: 0, errors: [] as string[], configured: Boolean(env.DB && env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY) };
  if (!env.DB || !env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY) return summary;
  webPush.setVapidDetails("mailto:notifications@anesthetistoncall.in", env.WEB_PUSH_PUBLIC_KEY, env.WEB_PUSH_PRIVATE_KEY);
  const rows = await env.DB.prepare("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?").bind(userId).all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
  summary.attempted = rows.results.length;
  await Promise.all(rows.results.map(async (subscription) => {
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 300, urgency: "high", timeout: 15000 });
      summary.accepted++;
      if (payload.tag.startsWith("registration:")) console.info("Admin push sent successfully", { registrationId: payload.tag.slice(13), subscriptionId: subscription.id });
      if (notificationId) await env.DB!.prepare("INSERT INTO notification_deliveries(id,notification_id,channel,status) VALUES(?,?,'push','sent')").bind(crypto.randomUUID(), notificationId).run();
    } catch (error) {
      summary.failed++;
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
      summary.errors.push(statusCode ? `HTTP_${statusCode}` : "PUSH_SEND_FAILED");
      if (statusCode === 404 || statusCode === 410) {
        summary.expired++;
        await env.DB!.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(subscription.id).run();
        if (payload.tag.startsWith("registration:")) console.info("Invalid Admin subscription removed", { subscriptionId: subscription.id, statusCode });
      }
      if (payload.tag.startsWith("registration:")) console.error("Admin push failed", { registrationId: payload.tag.slice(13), subscriptionId: subscription.id, statusCode: statusCode || undefined });
      if (notificationId) await env.DB!.prepare("INSERT INTO notification_deliveries(id,notification_id,channel,status,error_code) VALUES(?,?,'push','failed',?)").bind(crypto.randomUUID(), notificationId, statusCode ? `HTTP_${statusCode}` : "PUSH_SEND_FAILED").run();
    }
  }));
  return summary;
}

export async function sendWebPushForCase(caseId: string, kind: string, dedupePrefix?: string) {
  if (!env.DB) return;
  const caseRow = await env.DB.prepare("SELECT procedure_name AS name FROM cases WHERE id=? AND status='open'").bind(caseId).first<{name:string}>();
  if (caseRow) await publishAdminNotice({ title: kind === "sos_alert" ? "Emergency / SOS Case" : "New case posted", body: caseRow.name, url: "/admin", tag: `admin-case:${caseId}:${kind}:${dedupePrefix ?? ""}` }, `case:${caseId}:${kind}:${dedupePrefix ?? ""}`, caseId);
  const notices = await env.DB.prepare(`SELECT n.id,n.user_id AS userId,n.title,n.body FROM notifications n
    JOIN users u ON u.id=n.user_id JOIN clinician_profiles cp ON cp.user_id=u.id JOIN cases c ON c.id=n.case_id
    WHERE n.case_id=? AND n.kind=? AND (? IS NULL OR substr(n.dedupe_key,1,length(?))=?)
    AND c.status='open' AND u.role='anesthetist' AND u.status='verified' AND COALESCE(u.account_status,'active')='active'
    AND cp.verification_status='verified' AND (EXISTS (SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id AND a.status='available' AND datetime(a.start_at)<=CURRENT_TIMESTAMP AND datetime(a.end_at)>CURRENT_TIMESTAMP)
      OR (cp.case_notifications_enabled=1 AND cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP
        AND NOT EXISTS (SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id)))
    AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id=n.user_id)
    AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.id='case-push:'||n.id)`
  ).bind(caseId, kind, dedupePrefix ?? null, dedupePrefix ?? null, dedupePrefix ?? null).all<{ id: string; userId: string; title: string; body: string }>();
  if (!env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY) return;
  await Promise.allSettled(notices.results.map(async (notice) => {
    const current = await env.DB!.prepare("SELECT c.posted_by_user_id AS requesterId,h.city,EXISTS(SELECT 1 FROM case_audit_events e WHERE e.case_id=c.id AND e.event_type='replacement_requested') AS replacement FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id=? AND c.status='open'").bind(caseId).first<{requesterId:string;city:string;replacement:number}>();
    if (!current) return;
    if (current.replacement && !(await replacementRecipients(env.DB!,current.requesterId,current.city)).some(recipient => recipient.id === notice.userId)) return;
    // Claim before delivery so retried case submissions do not send duplicate alerts.
    const claim = await env.DB!.prepare("INSERT OR IGNORE INTO notification_deliveries(id,notification_id,channel,status) VALUES(?,?,'push','sending')").bind(`case-push:${notice.id}`, notice.id).run();
    if (!claim.meta.changes) return;
    const stillOpen = await env.DB!.prepare("SELECT id FROM cases WHERE id=? AND status='open'").bind(caseId).first();
    if (!stillOpen) {
      await env.DB!.prepare("UPDATE notification_deliveries SET status='skipped',error_code='REQUEST_CANCELLED' WHERE id=?").bind(`case-push:${notice.id}`).run();
      return;
    }
    try {
      await sendWebPush(notice.userId, { title: notice.title, body: notice.body, url: kind === "sos_alert" ? "/emergency" : `/cases#case-${caseId}`, tag: notice.id }, notice.id, false);
      await env.DB!.prepare("UPDATE notification_deliveries SET status=CASE WHEN EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.notification_id=? AND d.channel='push' AND d.status='sent') THEN 'sent' ELSE 'failed' END WHERE id=?").bind(notice.id, `case-push:${notice.id}`).run();
    } catch {
      await env.DB!.prepare("UPDATE notification_deliveries SET status='failed',error_code='PUSH_SEND_FAILED' WHERE id=?").bind(`case-push:${notice.id}`).run();
    }
  }));
}

// Called only for a newly committed registration. The registration ID is the
// notification tag, so duplicate subscriptions on a device collapse safely.
export async function notifyAdminsOfRegistration(registration: { id: string; role: "hospital" | "diagnostic_center" | "anesthetist" | "surgeon"; name: string; approvalRequestId?: string }) {
  if (!env.DB) return;
  const admins = await env.DB.prepare("SELECT u.id, u.mobile FROM users u WHERE u.role='admin' AND u.status='verified' AND u.account_status='active' AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id=u.id)").all<{ id: string; mobile: string }>();
  const authorized = admins.results.filter(admin => isAdminMobile(admin.mobile));
  const counts = await Promise.all(authorized.map(async admin => {
    const row = await env.DB!.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id=?").bind(admin.id).first<{ count: number }>();
    return row?.count ?? 0;
  }));
  console.info("Admin subscriptions found", { registrationId: registration.id, count: counts.reduce((a, b) => a + b, 0) });
  if (!env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY) {
    console.error("Admin registration push failed", { registrationId: registration.id, reason: "VAPID_UNAVAILABLE" });
    return;
  }
  const role = { hospital: "Hospital", diagnostic_center: "Diagnostic Center", anesthetist: "Anaesthetist", surgeon: "Surgeon" }[registration.role];
  const name = registration.name.slice(0, 140);
  const url = registration.role === "hospital" || registration.role === "diagnostic_center" ? "/admin" : "/admin/clinicians";
  const payload = { title: registration.approvalRequestId ? "Approval documents received" : "New Registration Received", body: `${registration.approvalRequestId ? "Verification documents submitted for" : "New " + role + " registration:"} ${name}. Tap to review and approve. (${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" , hour12: true })} IST)`, url, tag: registration.approvalRequestId ? `approval:${registration.approvalRequestId}` : `registration:${registration.id}` };
  await publishAdminNotice(payload, payload.tag);
  await Promise.all(authorized.map(async admin => {
    try {
      // Admin inbox and push were delivered once by publishAdminNotice.
      console.info("Admin registration push completed", { registrationId: registration.id, adminId: admin.id });
    } catch (error) {
      console.error("Admin registration push failed", { registrationId: registration.id, adminId: admin.id, reason: error instanceof Error ? error.name : "UNKNOWN" });
    }
  }));
}

// Admin monitoring is independent of clinician availability and notification preferences.
export async function publishAdminNotice(payload: PushPayload, eventKey: string, caseId: string | null = null, alreadyReceivingUserId?: string) {
  if (!env.DB) return;
  const rows = await env.DB.prepare("SELECT id,mobile FROM users WHERE role='admin' AND status='verified' AND account_status='active'").all<{id:string;mobile:string}>();
  await Promise.allSettled(rows.results.filter(row => isAdminMobile(row.mobile)).map(async admin => {
    const id = crypto.randomUUID();
    const inserted = await env.DB!.prepare("INSERT OR IGNORE INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key) VALUES(?,?,?,'admin_monitor',?,?,?)")
      .bind(id, admin.id, caseId, payload.title, payload.body, `admin-monitor:${eventKey}:${admin.id}`).run();
    if (!inserted.meta.changes) return;
    await env.DB!.prepare("INSERT INTO notification_deliveries(id,notification_id,channel,status) VALUES(?,?,'in_app','sent')").bind(crypto.randomUUID(), id).run();
    if (admin.id !== alreadyReceivingUserId) await sendWebPush(admin.id, { ...payload, url: "/admin", tag: id }, id, false);
  }));
}
