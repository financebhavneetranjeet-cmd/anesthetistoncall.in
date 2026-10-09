export const REGISTRATION_HANDOFF_KEY = "aoc.registration.v1";

export type RegistrationHandoff = {
  challengeId: string;
  mobile: string;
  role?: "hospital" | "anesthetist" | "surgeon";
  facilityType?: "hospital" | "diagnostic_center";
};

export function readRegistrationHandoff(): RegistrationHandoff | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(REGISTRATION_HANDOFF_KEY) ?? "null") as Partial<RegistrationHandoff> | null;
    if (!value || typeof value.challengeId !== "string" || !/^[6-9]\d{9}$/.test(value.mobile ?? "")) return null;
    return value as RegistrationHandoff;
  } catch {
    return null;
  }
}

export function saveRegistrationHandoff(value: RegistrationHandoff) {
  sessionStorage.setItem(REGISTRATION_HANDOFF_KEY, JSON.stringify(value));
}

export function clearRegistrationHandoff() {
  sessionStorage.removeItem(REGISTRATION_HANDOFF_KEY);
}
