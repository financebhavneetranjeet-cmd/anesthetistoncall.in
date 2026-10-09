import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "components/auth/otp-verification.tsx",
  "lib/auth/otp.ts",
  "lib/auth/widget.ts",
  "app/api/otp/widget/route.ts",
  "app/login/login-form.tsx",
  "app/register/choose-role/role-choice.tsx",
  "app/api/hospitals/register/route.ts",
  "app/api/clinicians/register/route.ts",
  "lib/server/login.ts",
  "lib/server/session.ts",
];

const contentChecks = [
  ["lib/auth/otp.ts", ["/^\\d{4}$/", "normalizeIndianMobileInput"]],
  ["components/auth/otp-verification.tsx", ["maxLength={4}", "sendMobileOtp", "verifyMobileOtp", "exchangeVerifiedMobile"]],
  ["lib/auth/widget.ts", ["https://verify.msg91.com/otp-provider.js", "exposeMethods: true", "access-token", "/api/otp/widget", "waitForProviderInitialiser", "script.onload"]],
  ["app/api/otp/widget/route.ts", ["MSG91_WIDGET_ID", "MSG91_WIDGET_TOKEN", "MSG91_AUTH_KEY", "verifyAccessToken", "identifier !== `91${mobile}`"]],
  ["app/login/login-form.tsx", ["purpose=\"login\"", "/register/choose-role", "redirectTo"]],
  ["app/register/choose-role/role-choice.tsx", ["hospital", "anesthetist", "surgeon"]],
  ["app/api/hospitals/register/route.ts", ["purpose = 'registration'", "consumed_at IS NULL", "createSession"]],
  ["app/api/clinicians/register/route.ts", ["purpose = 'registration'", "consumed_at IS NULL", "createSession"]],
  ["lib/server/login.ts", ["postLoginDestination", "/account/pending", "/cases"]],
  ["lib/server/session.ts", ["httpOnly: true", "secure: true", "sameSite: \"lax\""]],
];

const failures = [];

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    failures.push(`Missing authentication file: ${file}`);
  }
}

for (const [file, markers] of contentChecks) {
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch {
    failures.push(`Unable to inspect authentication file: ${file}`);
    continue;
  }

  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`Missing authentication safeguard in ${file}: ${marker}`);
  }
}

if (failures.length) {
  console.error("Authentication stability check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Authentication stability check passed.");
