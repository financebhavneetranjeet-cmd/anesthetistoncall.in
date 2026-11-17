ALTER TABLE users ADD COLUMN registration_challenge_id TEXT REFERENCES otp_challenges(id);
--> statement-breakpoint
ALTER TABLE users ADD COLUMN previous_account_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE clinician_profiles ADD COLUMN archived_at TEXT;
--> statement-breakpoint
DROP INDEX clinician_registration_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX clinician_registration_unique ON clinician_profiles(state_council, registration_number) WHERE archived_at IS NULL;
--> statement-breakpoint
CREATE TABLE archived_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  mobile TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  blocking_reason TEXT
);
--> statement-breakpoint
CREATE INDEX archived_accounts_mobile_idx ON archived_accounts(mobile, deleted_at);
--> statement-breakpoint
CREATE TABLE mobile_security_bans (
  mobile TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  banned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cleared_at TEXT
);
--> statement-breakpoint
CREATE TRIGGER archive_account AFTER INSERT ON archived_accounts
BEGIN
  UPDATE users SET mobile = 'deleted:' || NEW.user_id, account_status = 'blocked',
    suspended_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.user_id;
  UPDATE clinician_profiles SET archived_at = NEW.deleted_at, availability_status = 'unavailable',
    available_until = NULL, case_notifications_enabled = 0, availability_latitude = NULL,
    availability_longitude = NULL, availability_location_at = NULL WHERE user_id = NEW.user_id;
  UPDATE case_responses SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
    WHERE clinician_user_id = NEW.user_id AND status = 'available'
      AND case_id IN (SELECT id FROM cases WHERE status IN ('open', 'replacement_searching'));
  DELETE FROM sessions WHERE user_id = NEW.user_id;
  DELETE FROM push_subscriptions WHERE user_id = NEW.user_id;
  DELETE FROM google_identities WHERE mobile = NEW.mobile;
  UPDATE google_auth_flows SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id AND consumed_at IS NULL;
  UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE mobile = NEW.mobile AND consumed_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER guard_new_registration BEFORE INSERT ON users
WHEN NEW.registration_challenge_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'MOBILE_SECURITY_BAN')
    WHERE EXISTS (SELECT 1 FROM mobile_security_bans WHERE mobile = NEW.mobile AND cleared_at IS NULL);
  SELECT RAISE(ABORT, 'MOBILE_ACCOUNT_EXISTS')
    WHERE EXISTS (SELECT 1 FROM users WHERE mobile = NEW.mobile);
  SELECT RAISE(ABORT, 'MOBILE_NOT_VERIFIED')
    WHERE NOT EXISTS (
      SELECT 1 FROM otp_challenges otp WHERE otp.id = NEW.registration_challenge_id
        AND otp.mobile = NEW.mobile AND otp.purpose = 'registration' AND otp.status = 'verified'
        AND otp.consumed_at IS NULL AND datetime(otp.expires_at) > CURRENT_TIMESTAMP
    );
  UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = NEW.registration_challenge_id;
END;
--> statement-breakpoint
CREATE TRIGGER revoke_on_mobile_ban_insert AFTER INSERT ON mobile_security_bans
BEGIN
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE mobile=NEW.mobile);
  DELETE FROM push_subscriptions WHERE user_id IN (SELECT id FROM users WHERE mobile=NEW.mobile);
  DELETE FROM google_identities WHERE mobile=NEW.mobile;
  UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE mobile=NEW.mobile AND consumed_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER revoke_on_mobile_ban_update AFTER UPDATE ON mobile_security_bans
BEGIN
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE mobile=NEW.mobile);
  DELETE FROM push_subscriptions WHERE user_id IN (SELECT id FROM users WHERE mobile=NEW.mobile);
  DELETE FROM google_identities WHERE mobile=NEW.mobile;
  UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE mobile=NEW.mobile AND consumed_at IS NULL;
END;
