ALTER TABLE archived_accounts ADD COLUMN archived_by_reregistration INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
DROP TRIGGER guard_new_registration;
--> statement-breakpoint
CREATE TRIGGER guard_new_registration BEFORE INSERT ON users
WHEN NEW.registration_challenge_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'MOBILE_SECURITY_BAN')
    WHERE EXISTS (SELECT 1 FROM mobile_security_bans WHERE mobile = NEW.mobile AND cleared_at IS NULL);
  SELECT RAISE(ABORT, 'MOBILE_ACCOUNT_EXISTS')
    WHERE EXISTS (SELECT 1 FROM users WHERE mobile = NEW.mobile AND (account_status != 'blocked' OR role = 'admin'));
  SELECT RAISE(ABORT, 'MOBILE_NOT_VERIFIED')
    WHERE NOT EXISTS (
      SELECT 1 FROM otp_challenges otp WHERE otp.id = NEW.registration_challenge_id
        AND otp.mobile = NEW.mobile AND otp.purpose = 'registration' AND otp.status = 'verified'
        AND otp.consumed_at IS NULL AND datetime(otp.expires_at) > CURRENT_TIMESTAMP
    );
  UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = NEW.registration_challenge_id;
  INSERT INTO archived_accounts(user_id, mobile, blocking_reason, archived_by_reregistration)
    SELECT u.id, u.mobile,
      (SELECT reason FROM user_access_audit_logs WHERE user_id = u.id AND action IN ('block','reject')
        ORDER BY created_at DESC, rowid DESC LIMIT 1), 1
    FROM users u WHERE u.mobile = NEW.mobile AND u.account_status = 'blocked' AND u.role != 'admin';
END;
--> statement-breakpoint
CREATE TRIGGER revoke_otp_on_account_block AFTER UPDATE OF account_status ON users
WHEN NEW.account_status = 'blocked' AND OLD.account_status != 'blocked'
BEGIN
  UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE mobile = NEW.mobile AND consumed_at IS NULL;
END;
