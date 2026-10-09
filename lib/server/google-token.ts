import { createRemoteJWKSet, jwtVerify } from "jose";

const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 10000, cooldownDuration: 30000 });

export async function verifiedGoogleIdentity(token: string, clientId: string, nonce: string) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId,
    algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "nonce"], maxTokenAge: "10m", clockTolerance: 30,
  });
  if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 254 ||
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
      (payload.azp !== undefined && payload.azp !== clientId)) throw new Error("GOOGLE_IDENTITY_INVALID");
  // Google's stable subject is the login key. An email match never links accounts.
  return { subject: payload.sub, email: payload.email.trim().toLowerCase() };
}
