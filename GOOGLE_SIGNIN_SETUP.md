# Google Fast Access — prepared, not deployed

The existing production application now has a tested local implementation of Google login alongside Mobile OTP. Activation is blocked by missing Google OAuth configuration. The public case-list deployment remains live and unchanged.

## Required configuration

In the existing Google Cloud project, configure a **Web application** OAuth client:

- App homepage / authorized origin: `https://anesthetistoncall.in`
- Authorized redirect URI: `https://anesthetistoncall.in/api/auth/google/callback`
- Requested scopes: `openid email`
- Configure branding, authorized domain and the appropriate production audience in Google Auth Platform.

Set these production Site variables securely:

| Variable | Value |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | The Web application's OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The matching client secret, marked secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Optional; defaults to the redirect URI above |

Do not use a Maps API key as a login credential. Do not paste the client secret into chat or commit it to Git. A configured Google account is not automatically enrolled as a user.

## Account behavior

1. Existing users authenticate with the unchanged four-digit MSG91 Mobile OTP.
2. Users can connect Google, or continue without connecting it.
3. The server verifies Google's signed identity and links its stable subject to the existing mobile group. It does not match accounts by an unverified email.
4. Later Google sign-ins load the same existing role-specific user ID. Admin/Anaesthetist dashboard choice and approval gates remain intact.

Google verification uses state, PKCE, nonce, signature/issuer/audience/expiry checks, a ten-minute single-use flow, secure HTTP-only cookies and persistent rate limits. Application code does not log provider tokens or codes. The Google email is verified before linking; the profile email alone never authenticates anyone.

## Changes

- Login page and `components/auth/google-button.tsx`: Google fast access and visible Mobile OTP.
- `app/account/google/page.tsx`: first-time linking and success screen.
- `app/api/auth/google/{start,callback}/route.ts`, `lib/server/google-auth.ts`, `lib/server/google-token.ts`: OAuth exchange, verification, linking and session reuse.
- Existing OTP routes: optional linking prompt after successful OTP when Google is configured.
- Hospital/clinician registration forms and handlers, `lib/auth/email.ts`: valid email required for new registrations.
- `lib/server/login.ts`: Google reuses the login lookup without provisioning Admin records.
- `db/schema.ts`, `drizzle/0029_google_fast_access.sql`, appended Drizzle metadata: three additive tables; no existing data/table removal.
- `cloudflare-env.d.ts`, package manifest/lock: OAuth configuration types and pinned `jose` JWT verification dependency.
- `scripts/verify-google-auth.mjs`: isolated database integration tests using actual signed test JWTs and real application handlers.

## Verification results

- Production build and existing regression/prebuild checks: passed.
- 18 Google/Mobile OTP/registration integration groups: passed.
- Covered: invalid/missing registration email for all three roles; pending approvals; initial Google linking; same-account repeat login; unverified-email matching rejected; duplicate linking rejected; state/cookie/expiry checks; signature, issuer, audience, nonce and verified-email checks; callback replay; session-bound linking; blocked/suspended/deactivated accounts; absent roles; multi-role selection; Admin/Anaesthetist chooser; rate limits; missing configuration; Mobile OTP after Google; existing-user prompt; four-digit OTP resend adapter.
- SMS and Google network responses are mocked in integration tests. Live Google consent and real SMS delivery are not confirmed by these tests.
- Android Chrome/PWA, iPhone Safari/Home Screen PWA and real-provider desktop end-to-end login remain to be tested after configuration. Do not describe these as passed.

OAuth reference: https://developers.google.com/identity/openid-connect/openid-connect

- Local desktop and 390px mobile browser smoke checks: both Google and Mobile OTP controls present; no browser runtime errors. Google is disabled until configured.
- Standalone TypeScript check is not clean: errors remain in other existing application modules; the production build passes.
