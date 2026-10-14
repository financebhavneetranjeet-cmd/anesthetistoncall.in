export const RELEASES = [
  { version: "1.1", name: "Fresh Start" },
  { version: "1.2", name: "Smooth Updates" },
  { version: "1.3", name: "Notification Alerts" },
  { version: "1.4", name: "Multi-Role Accounts" },
  { version: "1.5", name: "Easy Availability" },
  { version: "1.6", name: "Available Anaesthetist Push Alerts" },
  { version: "1.7", name: "Simpler Case Posting" },
] as const;

export const CURRENT_RELEASE = RELEASES.at(-1)!;
