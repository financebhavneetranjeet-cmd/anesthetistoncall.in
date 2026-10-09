import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const USER_ROLES = ["hospital", "anesthetist", "surgeon", "admin"] as const;
export const USER_STATUSES = ["pending", "verified", "suspended"] as const;
export const ACCOUNT_STATUSES = ["active", "suspended", "blocked"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), mobile: text("mobile").notNull(), email: text("email"), fullName: text("full_name").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull(), status: text("status", { enum: USER_STATUSES }).notNull().default("pending"),
  accountStatus: text("account_status", { enum: ACCOUNT_STATUSES }).notNull().default("active"),
  suspendedUntil: text("suspended_until"),
  medicalRegistrationNumber: text("medical_registration_number"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("users_mobile_role_unique").on(table.mobile, table.role), index("users_mobile_idx").on(table.mobile), index("users_role_idx").on(table.role)]);

export const googleIdentities = sqliteTable("google_identities", {
  subject: text("subject").primaryKey(), mobile: text("mobile").notNull(),
  email: text("email").notNull(), linkedByUserId: text("linked_by_user_id").notNull().references(() => users.id),
  linkedAt: text("linked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("google_identity_mobile_unique").on(table.mobile), uniqueIndex("google_identity_email_unique").on(table.email)]);

export const googleAuthFlows = sqliteTable("google_auth_flows", {
  id: text("id").primaryKey(), browserHash: text("browser_hash").notNull(), purpose: text("purpose").notNull(), role: text("role").notNull(),
  userId: text("user_id").references(() => users.id), sessionHash: text("session_hash"),
  expiresAt: text("expires_at").notNull(), consumedAt: text("consumed_at"),
}, table => [index("google_auth_expiry_idx").on(table.expiresAt)]);

export const googleAuthLimits = sqliteTable("google_auth_limits", {
  id: text("id").primaryKey(), count: integer("count").notNull(), expiresAt: text("expires_at").notNull(),
}, table => [index("google_auth_limit_expiry_idx").on(table.expiresAt)]);

export const hospitals = sqliteTable("hospitals", {
  id: text("id").primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => users.id), name: text("name").notNull(),
  facilityType: text("facility_type", { enum: ["hospital", "diagnostic_center"] }).notNull().default("hospital"),
  address: text("address").notNull(), city: text("city").notNull().default("Amritsar"), googlePlaceId: text("google_place_id"),
  latitude: text("latitude"), longitude: text("longitude"), googleMapsUrl: text("google_maps_url"), approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("hospitals_owner_idx").on(table.ownerUserId)]);

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(), hospitalId: text("hospital_id").notNull().references(() => hospitals.id), procedureName: text("procedure_name").notNull(),
  specialty: text("specialty"), location: text("location"),
  anaesthesiaType: text("anaesthesia_type").notNull(), scheduledAt: text("scheduled_at").notNull(), offeredFeePaise: integer("offered_fee_paise").notNull(),
  status: text("status", { enum: ["pending_approval", "open", "offered", "assigned", "cancelled", "completed", "replacement_required", "replacement_searching", "replacement_offered"] }).notNull().default("pending_approval"),
  urgency: text("urgency", { enum: ["routine", "urgent", "emergency"] }).notNull().default("routine"),
  durationMinutes: integer("duration_minutes"), publicNotes: text("public_notes"), biddingEnabled: integer("bidding_enabled", { mode: "boolean" }).notNull().default(false),
  assignedClinicianUserId: text("assigned_clinician_user_id").references(() => users.id),
  finalAgreedFeePaise: integer("final_agreed_fee_paise"), feeLockedAt: text("fee_locked_at"),
  otStatus: text("ot_status", { enum: ["awaiting_arrival", "arrived", "ready_for_ot", "case_started", "completion_pending", "case_completed"] }).notNull().default("awaiting_arrival"),
  arrivedAt: text("arrived_at"), otReadyAt: text("ot_ready_at"), caseStartedAt: text("case_started_at"), caseCompletedAt: text("case_completed_at"), actualDurationMinutes: integer("actual_duration_minutes"),
  completionRequestedAt:text("completion_requested_at"),completionRequestedByUserId:text("completion_requested_by_user_id").references(()=>users.id),completionConfirmedAt:text("completion_confirmed_at"),completionConfirmedByUserId:text("completion_confirmed_by_user_id").references(()=>users.id),
  approvedAt: text("approved_at"), assignedAt: text("assigned_at"), closedAt: text("closed_at"),
  postedByUserId: text("posted_by_user_id").references(() => users.id),
  isEmergency: integer("is_emergency", { mode: "boolean" }).notNull().default(false),
  requiredArrivalAt: text("required_arrival_at"),
  sosStatus: text("sos_status", { enum: ["searching", "matched", "cancelled", "closed"] }),
  sosOfferVersion: integer("sos_offer_version").notNull().default(1),
  sosSearchRadiusKm: integer("sos_search_radius_km").notNull().default(15),
  sosExpiresAt: text("sos_expires_at"), sosLastAlertedAt: text("sos_last_alerted_at"), cancelledAt: text("cancelled_at"),
  isPlanned: integer("is_planned",{mode:"boolean"}).notNull().default(false), bookingStatus:text("booking_status",{enum:["requested","selected","confirmed","reschedule_pending","cancelled"]}),
  bookingBufferMinutes:integer("booking_buffer_minutes").notNull().default(30), scheduleRevision:integer("schedule_revision").notNull().default(1), rescheduleRequestedAt:text("reschedule_requested_at"), cancellationReason:text("cancellation_reason"), cancelledByUserId:text("cancelled_by_user_id").references(()=>users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("cases_hospital_idx").on(table.hospitalId), index("cases_status_idx").on(table.status)]);

export const caseAuditEvents = sqliteTable("case_audit_events", {
  id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),actorUserId:text("actor_user_id").references(()=>users.id),eventType:text("event_type").notNull(),details:text("details"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},(table)=>[index("case_audit_case_idx").on(table.caseId,table.createdAt)]);

export const otRooms=sqliteTable("ot_rooms",{id:text("id").primaryKey(),hospitalId:text("hospital_id").notNull().references(()=>hospitals.id),name:text("name").notNull(),status:text("status",{enum:["free","occupied","preparing","cleaning","delayed"]}).notNull().default("free"),active:integer("active",{mode:"boolean"}).notNull().default(true),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("ot_room_hospital_name_unique").on(t.hospitalId,t.name),index("ot_room_hospital_status_idx").on(t.hospitalId,t.status)]);
export const caseOtAssignments=sqliteTable("case_ot_assignments",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),otRoomId:text("ot_room_id").notNull().references(()=>otRooms.id),scheduledStart:text("scheduled_start").notNull(),scheduledEnd:text("scheduled_end").notNull(),assignedByUserId:text("assigned_by_user_id").notNull().references(()=>users.id),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("case_ot_assignment_case_unique").on(t.caseId),index("case_ot_assignment_room_time_idx").on(t.otRoomId,t.scheduledStart,t.scheduledEnd)]);
export const otPreparationChecks=sqliteTable("ot_preparation_checks",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),checkType:text("check_type",{enum:["ot_ready","patient_shifted","equipment_ready","anaesthesia_machine_ready"]}).notNull(),completed:integer("completed",{mode:"boolean"}).notNull().default(false),completedByUserId:text("completed_by_user_id").references(()=>users.id),completedAt:text("completed_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("ot_preparation_case_check_unique").on(t.caseId,t.checkType)]);
export const otCaseStates=sqliteTable("ot_case_states",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),anaesthesiaStartedAt:text("anaesthesia_started_at"),surgeryStartedAt:text("surgery_started_at"),surgeryEndedAt:text("surgery_ended_at"),recoveryStatus:text("recovery_status",{enum:["stable","under_observation","shifted_to_ward","shifted_to_icu","discharged"]}),recoveryStartedAt:text("recovery_started_at"),recoveryEndedAt:text("recovery_ended_at"),updatedByUserId:text("updated_by_user_id").references(()=>users.id),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("ot_case_state_case_unique").on(t.caseId)]);
export const caseDelays=sqliteTable("case_delays",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),reason:text("reason",{enum:["surgeon_delayed","patient_delayed","ot_occupied","equipment_issue","emergency_case","other"]}).notNull(),notes:text("notes"),delayMinutes:integer("delay_minutes").notNull(),reportedByUserId:text("reported_by_user_id").notNull().references(()=>users.id),resolvedAt:text("resolved_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("case_delay_case_idx").on(t.caseId,t.createdAt)]);
export const anaesthesiaRecords=sqliteTable("anaesthesia_records",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),assignedAnaesthetistUserId:text("assigned_anaesthetist_user_id").notNull().references(()=>users.id),status:text("status",{enum:["draft","review","finalized"]}).notNull().default("draft"),recordMode:text("record_mode",{enum:["standard","emergency_limited"]}).notNull().default("standard"),dataJson:text("data_json").notNull().default("{}"),finalSnapshotJson:text("final_snapshot_json"),version:integer("version").notNull().default(1),signedByUserId:text("signed_by_user_id").references(()=>users.id),signedAt:text("signed_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("anaesthesia_record_case_unique").on(t.caseId),index("anaesthesia_record_anaesthetist_idx").on(t.assignedAnaesthetistUserId,t.status)]);
export const anaesthesiaEntries=sqliteTable("anaesthesia_entries",{id:text("id").primaryKey(),recordId:text("record_id").notNull().references(()=>anaesthesiaRecords.id),entryType:text("entry_type",{enum:["vital","drug","fluid","blood_product","event","complication"]}).notNull(),recordedAt:text("recorded_at").notNull(),payloadJson:text("payload_json").notNull(),retrospective:integer("retrospective",{mode:"boolean"}).notNull().default(false),createdByUserId:text("created_by_user_id").notNull().references(()=>users.id),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("anaesthesia_entry_record_time_idx").on(t.recordId,t.recordedAt)]);
export const anaesthesiaRecordAudit=sqliteTable("anaesthesia_record_audit",{id:text("id").primaryKey(),recordId:text("record_id").notNull().references(()=>anaesthesiaRecords.id),actorUserId:text("actor_user_id").notNull().references(()=>users.id),action:text("action").notNull(),version:integer("version").notNull(),details:text("details"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("anaesthesia_audit_record_idx").on(t.recordId,t.createdAt)]);
export const anaesthesiaAddenda=sqliteTable("anaesthesia_addenda",{id:text("id").primaryKey(),recordId:text("record_id").notNull().references(()=>anaesthesiaRecords.id),authorUserId:text("author_user_id").notNull().references(()=>users.id),reason:text("reason").notNull(),content:text("content").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("anaesthesia_addendum_record_idx").on(t.recordId,t.createdAt)]);
export const anaesthesiaTemplates=sqliteTable("anaesthesia_templates",{id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull().references(()=>users.id),name:text("name").notNull(),technique:text("technique").notNull(),templateJson:text("template_json").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("anaesthesia_template_owner_name_unique").on(t.ownerUserId,t.name)]);

export const caseRatings = sqliteTable("case_ratings", {
  id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),raterUserId:text("rater_user_id").notNull().references(()=>users.id),ratedUserId:text("rated_user_id").notNull().references(()=>users.id),rating:integer("rating").notNull(),feedback:text("feedback"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  coordinationRating:integer("coordination_rating"),otReadinessRating:integer("ot_readiness_rating"),paymentExperienceRating:integer("payment_experience_rating"),professionalConductRating:integer("professional_conduct_rating"),disputedAt:text("disputed_at"),disputeReason:text("dispute_reason"),excludedFromScore:integer("excluded_from_score",{mode:"boolean"}).notNull().default(false),
  punctualityRating:integer("punctuality_rating"),communicationRating:integer("communication_rating"),clinicalCoordinationRating:integer("clinical_coordination_rating"),responsivenessRating:integer("responsiveness_rating"),caseInformationAccuracyRating:integer("case_information_accuracy_rating"),paymentReliabilityRating:integer("payment_reliability_rating"),
  direction:text("direction",{enum:["hospital_to_anaesthetist","anaesthetist_to_hospital"]}),status:text("status",{enum:["published","hidden","removed"]}).notNull().default("published"),privacyFlagged:integer("privacy_flagged",{mode:"boolean"}).notNull().default(false),moderationReason:text("moderation_reason"),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),editExpiresAt:text("edit_expires_at"),
},(table)=>[uniqueIndex("case_rating_unique").on(table.caseId,table.raterUserId),index("case_rating_target_idx").on(table.ratedUserId,table.createdAt)]);

export const reviewReports=sqliteTable("review_reports",{id:text("id").primaryKey(),ratingId:text("rating_id").notNull().references(()=>caseRatings.id),reportedByUserId:text("reported_by_user_id").notNull().references(()=>users.id),reason:text("reason").notNull(),status:text("status",{enum:["open","reviewed","dismissed"]}).notNull().default("open"),adminReason:text("admin_reason"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),resolvedAt:text("resolved_at")},t=>[uniqueIndex("review_report_unique").on(t.ratingId,t.reportedByUserId),index("review_report_status_idx").on(t.status,t.createdAt)]);
export const reviewAuditEvents=sqliteTable("review_audit_events",{id:text("id").primaryKey(),ratingId:text("rating_id").references(()=>caseRatings.id),caseId:text("case_id").notNull().references(()=>cases.id),actorUserId:text("actor_user_id").references(()=>users.id),actorRole:text("actor_role"),action:text("action").notNull(),details:text("details"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("review_audit_rating_idx").on(t.ratingId,t.createdAt),index("review_audit_case_idx").on(t.caseId,t.createdAt)]);

export const casePayments=sqliteTable("case_payments",{
 id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),payerUserId:text("payer_user_id").notNull().references(()=>users.id),payeeUserId:text("payee_user_id").notNull().references(()=>users.id),totalAmountPaise:integer("total_amount_paise").notNull(),confirmedAmountPaise:integer("confirmed_amount_paise").notNull().default(0),status:text("status",{enum:["due","payment_marked","partially_paid","settled","disputed"]}).notNull().default("due"),dueAt:text("due_at").notNull().default(sql`CURRENT_TIMESTAMP`),settledAt:text("settled_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},table=>[uniqueIndex("case_payment_case_unique").on(table.caseId),index("case_payment_payee_idx").on(table.payeeUserId,table.status),index("case_payment_payer_idx").on(table.payerUserId,table.status)]);
export const paymentEntries=sqliteTable("payment_entries",{
 id:text("id").primaryKey(),paymentId:text("payment_id").notNull().references(()=>casePayments.id),idempotencyKey:text("idempotency_key").notNull(),amountPaise:integer("amount_paise").notNull(),method:text("method",{enum:["upi","bank_transfer","cash","other"]}).notNull(),reference:text("reference"),note:text("note"),paidAt:text("paid_at").notNull(),status:text("status",{enum:["marked","received","disputed"]}).notNull().default("marked"),markedByUserId:text("marked_by_user_id").notNull().references(()=>users.id),confirmedByUserId:text("confirmed_by_user_id").references(()=>users.id),confirmedAt:text("confirmed_at"),disputeReason:text("dispute_reason"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},table=>[uniqueIndex("payment_entry_idempotency_unique").on(table.idempotencyKey),index("payment_entries_payment_idx").on(table.paymentId,table.createdAt)]);
export const paymentAuditEvents=sqliteTable("payment_audit_events",{
 id:text("id").primaryKey(),paymentId:text("payment_id").notNull().references(()=>casePayments.id),actorUserId:text("actor_user_id").references(()=>users.id),actorRole:text("actor_role"),eventType:text("event_type").notNull(),previousValue:text("previous_value"),newValue:text("new_value"),details:text("details"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},table=>[index("payment_audit_payment_idx").on(table.paymentId,table.createdAt)]);
export const paymentIssues=sqliteTable("payment_issues",{
 id:text("id").primaryKey(),paymentId:text("payment_id").notNull().references(()=>casePayments.id),caseId:text("case_id").notNull().references(()=>cases.id),raisedByUserId:text("raised_by_user_id").notNull().references(()=>users.id),reason:text("reason").notNull(),amountPaise:integer("amount_paise").notNull(),supportingNote:text("supporting_note"),status:text("status",{enum:["open","under_review","resolved","closed"]}).notNull().default("open"),adminRemarks:text("admin_remarks"),resolutionHistoryJson:text("resolution_history_json").notNull().default("[]"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},table=>[index("payment_issue_payment_idx").on(table.paymentId,table.status),index("payment_issue_case_idx").on(table.caseId,table.createdAt)]);

export const caseResponses = sqliteTable("case_responses", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => cases.id), clinicianUserId: text("clinician_user_id").notNull().references(() => users.id),
  proposedFeePaise: integer("proposed_fee_paise"), status: text("status", { enum: ["available", "selected", "accepted", "declined", "withdrawn"] }).notNull().default("available"), message: text("message"),
  responseType: text("response_type", { enum: ["accept_offer", "bid", "decline"] }), offerVersion: integer("offer_version").notNull().default(1),
  distanceMetres: integer("distance_metres"), etaMinutes: integer("eta_minutes"), responseLatitude: text("response_latitude"), responseLongitude: text("response_longitude"), locationCapturedAt: text("location_captured_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("case_response_unique").on(table.caseId, table.clinicianUserId)]);

export const casePrivateDetails = sqliteTable("case_private_details", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => cases.id), patientInitials: text("patient_initials"),
  patientAge: integer("patient_age"), patientSex: text("patient_sex", { enum: ["female", "male", "other"] }), contactPhone: text("contact_phone"), locationInstructions: text("location_instructions"), clinicalNotes: text("clinical_notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("case_private_details_case_unique").on(table.caseId)]);

export const caseJourneys = sqliteTable("case_journeys", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => cases.id), clinicianUserId: text("clinician_user_id").notNull().references(() => users.id),
  status: text("status", { enum: ["active", "arrived", "cancelled"] }).notNull().default("active"), consentedAt: text("consented_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`), arrivedAt: text("arrived_at"), cancelledAt: text("cancelled_at"),
  latestLatitude: text("latest_latitude"), latestLongitude: text("latest_longitude"), latestAccuracyMetres: integer("latest_accuracy_metres"), latestUpdatedAt: text("latest_updated_at"),
  distanceMetres: integer("distance_metres"), durationSeconds: integer("duration_seconds"), staticDurationSeconds: integer("static_duration_seconds"), routePolyline: text("route_polyline"), trafficMessage: text("traffic_message"),
}, (table) => [uniqueIndex("case_journey_case_unique").on(table.caseId), index("case_journey_status_idx").on(table.status, table.latestUpdatedAt)]);

export const journeyLocations = sqliteTable("journey_locations", {
  id: text("id").primaryKey(), journeyId: text("journey_id").notNull().references(() => caseJourneys.id), latitude: text("latitude").notNull(), longitude: text("longitude").notNull(), accuracyMetres: integer("accuracy_metres"), recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("journey_locations_journey_idx").on(table.journeyId, table.recordedAt)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(), userId: text("user_id").references(() => users.id), audienceRole: text("audience_role", { enum: USER_ROLES }),
  caseId: text("case_id").references(() => cases.id), kind: text("kind").notNull(), title: text("title").notNull(), body: text("body").notNull(),
  dedupeKey: text("dedupe_key"), readAt: text("read_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("notifications_user_idx").on(table.userId, table.createdAt), index("notifications_role_idx").on(table.audienceRole, table.createdAt), uniqueIndex("notifications_dedupe_unique").on(table.dedupeKey)]);

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: text("id").primaryKey(), notificationId: text("notification_id").notNull().references(() => notifications.id),
  channel: text("channel", { enum: ["in_app", "sms", "whatsapp"] }).notNull(),
  status: text("status", { enum: ["sent", "failed", "skipped", "sending"] }).notNull(), providerRequestId: text("provider_request_id"), errorCode: text("error_code"), retryCount: integer("retry_count").notNull().default(0),
  attemptedAt: text("attempted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("notification_delivery_unique").on(table.notificationId, table.channel), index("notification_delivery_status_idx").on(table.status, table.attemptedAt)]);

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: text("id").primaryKey(), actorEmail: text("actor_email").notNull(), action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id").notNull(), details: text("details"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("admin_audit_created_idx").on(table.createdAt), index("admin_audit_target_idx").on(table.targetType, table.targetId)]);

export const userAccessAuditLogs = sqliteTable("user_access_audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  action: text("action", { enum: ["suspend", "block", "restore"] }).notNull(),
  reason: text("reason").notNull(),
  adminActor: text("admin_actor").notNull(),
  previousStatus: text("previous_status", { enum: ACCOUNT_STATUSES }).notNull(),
  newStatus: text("new_status", { enum: ACCOUNT_STATUSES }).notNull(),
  suspensionExpiresAt: text("suspension_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("user_access_audit_user_idx").on(table.userId, table.createdAt), index("user_access_audit_created_idx").on(table.createdAt)]);

export const otpChallenges = sqliteTable("otp_challenges", {
  id: text("id").primaryKey(), mobile: text("mobile").notNull(), providerRequestId: text("provider_request_id"),
  purpose: text("purpose", { enum: ["login", "registration", "mobile_verification"] }).notNull(),
  status: text("status", { enum: ["pending", "verified", "expired", "failed"] }).notNull().default("pending"), attemptCount: integer("attempt_count").notNull().default(0),
  expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  verifiedAt: text("verified_at"), consumedAt: text("consumed_at"),
}, (table) => [index("otp_mobile_status_idx").on(table.mobile, table.status)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("push_subscriptions_user_idx").on(table.userId)]);

export const clinicianProfiles = sqliteTable("clinician_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  stateCouncil: text("state_council").notNull().default("Punjab Medical Council"),
  registrationNumber: text("registration_number").notNull(),
  qualification: text("qualification").notNull(),
  city: text("city").notNull().default("Amritsar"),
  verificationStatus: text("verification_status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  pmcVerificationStatus: text("pmc_verification_status", { enum: ["pending", "success", "failed", "unavailable", "manual"] }).notNull().default("pending"),
  pmcVerificationCheckedAt: text("pmc_verification_checked_at"),
  pmcVerificationNote: text("pmc_verification_note"),
  availabilityStatus: text("availability_status", { enum: ["unavailable", "available"] }).notNull().default("unavailable"),
  caseNotificationsEnabled: integer("case_notifications_enabled", { mode: "boolean" }).notNull().default(false),
  availableUntil: text("available_until"),
  availabilityLatitude: text("availability_latitude"), availabilityLongitude: text("availability_longitude"), availabilityLocationAt: text("availability_location_at"),
  preferredEmergencyFeePaise: integer("preferred_emergency_fee_paise"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("clinician_registration_unique").on(table.stateCouncil, table.registrationNumber), uniqueIndex("clinician_user_unique").on(table.userId), index("clinician_available_idx").on(table.verificationStatus, table.availabilityStatus, table.availableUntil)]);

export const availabilitySlots=sqliteTable("availability_slots",{id:text("id").primaryKey(),clinicianUserId:text("clinician_user_id").notNull().references(()=>users.id),status:text("status",{enum:["available","unavailable","tentative"]}).notNull(),startAt:text("start_at").notNull(),endAt:text("end_at").notNull(),preferredArea:text("preferred_area"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("availability_slot_clinician_time_idx").on(t.clinicianUserId,t.startAt,t.endAt)]);

export const smartScoreConfigs=sqliteTable("smart_score_configs",{id:text("id").primaryKey(),emergencyAvailability:integer("emergency_availability").notNull().default(25),emergencyEta:integer("emergency_eta").notNull().default(30),emergencyReliability:integer("emergency_reliability").notNull().default(20),emergencyRating:integer("emergency_rating").notNull().default(10),emergencyResponse:integer("emergency_response").notNull().default(10),emergencyFee:integer("emergency_fee").notNull().default(5),plannedAvailability:integer("planned_availability").notNull().default(20),plannedEta:integer("planned_eta").notNull().default(15),plannedReliability:integer("planned_reliability").notNull().default(20),plannedRating:integer("planned_rating").notNull().default(15),plannedResponse:integer("planned_response").notNull().default(10),plannedFee:integer("planned_fee").notNull().default(20),minimumCases:integer("minimum_cases").notNull().default(5),updatedBy:text("updated_by"),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const performanceExclusions=sqliteTable("performance_exclusions",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),metric:text("metric").notNull(),reason:text("reason").notNull(),active:integer("active",{mode:"boolean"}).notNull().default(true),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("performance_exclusion_case_idx").on(t.caseId,t.metric)]);
export const performanceFlags=sqliteTable("performance_flags",{id:text("id").primaryKey(),userId:text("user_id").references(()=>users.id),caseId:text("case_id").references(()=>cases.id),flagType:text("flag_type").notNull(),details:text("details"),status:text("status",{enum:["open","reviewed","dismissed"]}).notNull().default("open"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("performance_flag_status_idx").on(t.status,t.createdAt)]);
export const performanceAdminActions=sqliteTable("performance_admin_actions",{id:text("id").primaryKey(),actor:text("actor").notNull(),action:text("action").notNull(),targetUserId:text("target_user_id").references(()=>users.id),caseId:text("case_id").references(()=>cases.id),details:text("details"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("performance_admin_created_idx").on(t.createdAt)]);

export const cancellationConfigs=sqliteTable("cancellation_configs",{id:text("id").primaryKey(),earlyHours:integer("early_hours").notNull().default(24),lateHours:integer("late_hours").notNull().default(6),veryLateHours:integer("very_late_hours").notNull().default(2),noShowGraceMinutes:integer("no_show_grace_minutes").notNull().default(30),updatedByUserId:text("updated_by_user_id").references(()=>users.id),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const caseAssignmentHistory=sqliteTable("case_assignment_history",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),clinicianUserId:text("clinician_user_id").notNull().references(()=>users.id),assignmentType:text("assignment_type",{enum:["original","replacement"]}).notNull(),status:text("status",{enum:["assigned","cancelled","replaced","completed"]}).notNull().default("assigned"),finalFeePaise:integer("final_fee_paise"),assignedAt:text("assigned_at").notNull(),endedAt:text("ended_at"),endReason:text("end_reason"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("assignment_history_case_idx").on(t.caseId,t.assignedAt),index("assignment_history_clinician_idx").on(t.clinicianUserId,t.status)]);
export const caseIncidents=sqliteTable("case_incidents",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),incidentType:text("incident_type",{enum:["cancellation","no_show","hospital_not_ready","late_arrival","incorrect_information","other"]}).notNull(),reportedByUserId:text("reported_by_user_id").notNull().references(()=>users.id),subjectUserId:text("subject_user_id").references(()=>users.id),reasonCode:text("reason_code").notNull(),explanation:text("explanation"),timingClass:text("timing_class",{enum:["early","late","very_late","after_reporting","no_show"]}),minutesBeforeReporting:integer("minutes_before_reporting"),status:text("status",{enum:["reported","disputed","confirmed","excused","partial_responsibility","no_penalty","fraudulent"]}).notNull().default("reported"),reliabilityImpact:text("reliability_impact").notNull().default("pending_review"),adminNotes:text("admin_notes"),adminUserId:text("admin_user_id").references(()=>users.id),reviewedAt:text("reviewed_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("case_incident_case_idx").on(t.caseId,t.createdAt),index("case_incident_review_idx").on(t.status,t.createdAt),index("case_incident_subject_idx").on(t.subjectUserId,t.status)]);
export const incidentDisputes=sqliteTable("incident_disputes",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>caseIncidents.id),raisedByUserId:text("raised_by_user_id").notNull().references(()=>users.id),explanation:text("explanation").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("incident_dispute_user_unique").on(t.incidentId,t.raisedByUserId)]);
export const replacementSearches=sqliteTable("replacement_searches",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),incidentId:text("incident_id").notNull().references(()=>caseIncidents.id),originalClinicianUserId:text("original_clinician_user_id").references(()=>users.id),originalFeePaise:integer("original_fee_paise").notNull(),revisedOfferFeePaise:integer("revised_offer_fee_paise").notNull(),status:text("status",{enum:["required","searching","assigned","cancelled","no_replacement"]}).notNull().default("required"),offerVersion:integer("offer_version").notNull().default(1),requestedAt:text("requested_at"),acceptedAt:text("accepted_at"),replacementClinicianUserId:text("replacement_clinician_user_id").references(()=>users.id),responseSeconds:integer("response_seconds"),createdByUserId:text("created_by_user_id").notNull().references(()=>users.id),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex("replacement_search_case_active_unique").on(t.caseId),index("replacement_search_status_idx").on(t.status,t.requestedAt)]);

export const clinicalGovernanceReviewers=sqliteTable("clinical_governance_reviewers",{id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id),active:integer("active",{mode:"boolean"}).notNull().default(true),grantedByUserId:text("granted_by_user_id").notNull().references(()=>users.id),grantedAt:text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),revokedAt:text("revoked_at")},t=>[uniqueIndex("governance_reviewer_user_unique").on(t.userId),index("governance_reviewer_active_idx").on(t.active)]);
export const safetyIncidents=sqliteTable("safety_incidents",{id:text("id").primaryKey(),caseId:text("case_id").notNull().references(()=>cases.id),anaesthesiaRecordId:text("anaesthesia_record_id").references(()=>anaesthesiaRecords.id),reporterUserId:text("reporter_user_id").notNull().references(()=>users.id),reporterRole:text("reporter_role").notNull(),incidentAt:text("incident_at").notNull(),description:text("description").notNull(),immediateAction:text("immediate_action").notNull(),patientConditionAfter:text("patient_condition_after").notNull(),furtherTreatment:text("further_treatment"),icuTransfer:integer("icu_transfer",{mode:"boolean"}).notNull().default(false),cprOccurred:integer("cpr_occurred",{mode:"boolean"}).notNull().default(false),additionalHelpCalled:integer("additional_help_called",{mode:"boolean"}).notNull().default(false),followUpRequired:integer("follow_up_required",{mode:"boolean"}).notNull().default(false),critical:integer("critical",{mode:"boolean"}).notNull().default(false),status:text("status",{enum:["new","under_review","awaiting_information","follow_up_required","reviewed_no_action","reviewed_quality_improvement","escalated","closed"]}).notNull().default("new"),reviewerUserId:text("reviewer_user_id").references(()=>users.id),reviewDecision:text("review_decision"),submittedAt:text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),closedAt:text("closed_at")},t=>[index("safety_incident_case_idx").on(t.caseId,t.submittedAt),index("safety_incident_status_idx").on(t.status,t.critical,t.submittedAt),index("safety_incident_reporter_idx").on(t.reporterUserId,t.submittedAt)]);
export const safetyIncidentCategories=sqliteTable("safety_incident_categories",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>safetyIncidents.id),category:text("category").notNull()},t=>[uniqueIndex("safety_incident_category_unique").on(t.incidentId,t.category),index("safety_incident_category_idx").on(t.category)]);
export const safetyIncidentStatements=sqliteTable("safety_incident_statements",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>safetyIncidents.id),authorUserId:text("author_user_id").notNull().references(()=>users.id),authorRole:text("author_role").notNull(),statementType:text("statement_type",{enum:["response","addendum","information_request","review_note"]}).notNull(),content:text("content").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("safety_statement_incident_idx").on(t.incidentId,t.createdAt)]);
export const safetyIncidentDocuments=sqliteTable("safety_incident_documents",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>safetyIncidents.id),objectKey:text("object_key").notNull().unique(),fileName:text("file_name").notNull(),contentType:text("content_type").notNull(),sizeBytes:integer("size_bytes").notNull(),uploadedByUserId:text("uploaded_by_user_id").notNull().references(()=>users.id),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("safety_document_incident_idx").on(t.incidentId,t.createdAt)]);
export const safetyFollowUpActions=sqliteTable("safety_follow_up_actions",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>safetyIncidents.id),actionType:text("action_type").notNull(),details:text("details"),responsibleUserId:text("responsible_user_id").references(()=>users.id),targetDate:text("target_date"),completionDate:text("completion_date"),status:text("status",{enum:["open","in_progress","completed","cancelled"]}).notNull().default("open"),createdByUserId:text("created_by_user_id").notNull().references(()=>users.id),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("safety_followup_incident_idx").on(t.incidentId,t.status,t.targetDate)]);
export const safetyIncidentTimeline=sqliteTable("safety_incident_timeline",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>safetyIncidents.id),caseId:text("case_id").notNull().references(()=>cases.id),actorUserId:text("actor_user_id").references(()=>users.id),actorRole:text("actor_role"),eventType:text("event_type").notNull(),details:text("details"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("safety_timeline_incident_idx").on(t.incidentId,t.createdAt),index("safety_timeline_case_idx").on(t.caseId,t.createdAt)]);
export const safetyAccessLogs=sqliteTable("safety_access_logs",{id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>safetyIncidents.id),caseId:text("case_id").notNull().references(()=>cases.id),userId:text("user_id").notNull().references(()=>users.id),userRole:text("user_role").notNull(),action:text("action").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[index("safety_access_incident_idx").on(t.incidentId,t.createdAt),index("safety_access_user_idx").on(t.userId,t.createdAt)]);

export const verificationDocuments = sqliteTable("verification_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  documentType: text("document_type", { enum: ["pmc_certificate", "identity", "qualification"] }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("verification_documents_user_idx").on(table.userId)]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
