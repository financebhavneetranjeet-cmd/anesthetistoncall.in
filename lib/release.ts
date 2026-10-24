export const RELEASES = [
  { version: "1.1", name: "Fresh Start" },
  { version: "1.2", name: "Smooth Updates" },
  { version: "1.3", name: "Notification Alerts" },
  { version: "1.4", name: "Multi-Role Accounts" },
  { version: "1.5", name: "Easy Availability" },
  { version: "1.6", name: "Available Anaesthetist Push Alerts" },
  { version: "1.7", name: "Clear Dashboard Controls" },
  { version: "1.8", name: "Remembered Mobile Login" },
  { version: "1.9", name: "Owner and Admin Push Tests" },
  { version: "1.10", name: "Manual Map Refresh and Accurate Response Times" },
  { version: "1.11", name: "Automatic Installed App Updates" },
  { version: "1.12", name: "Hospital Fee Plus Additional Bid" },
  { version: "1.13", name: "Named Anaesthetist Selection Confirmation" },
  { version: "1.14", name: "Clearer Forms and Simpler Case Posting" },
  { version: "1.15", name: "Simpler Anaesthetist Dashboard" },
  { version: "1.16", name: "Accurate History and Reliable Location Controls" },
  { version: "1.17", name: "SMS Follow-up and Urgent Search" },
  { version: "1.18", name: "Clear Replacement Numbers and SMS Launch" },
] as const;

export const CURRENT_RELEASE = RELEASES.at(-1)!;
