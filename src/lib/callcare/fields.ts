/**
 * CallCare per-lead call-logging form — field definitions.
 *
 * The CallCare agent opens a per-lead link (token = Lead Id) when they CONNECT
 * with a lead, captures the conversation, and submits. The submit handler logs
 * a completed Call Task on the Lead. No new Salesforce fields required for v1 —
 * everything lands in standard Task fields + the Description block.
 *
 * Disposition picklist mirrors how CallCare dispositions a connected call.
 */

export const DISPOSITIONS = [
  "Appointment Booked",
  "Callback Requested",
  "Not Interested",
  "Below Minimum / Disqualified",
  "Do Not Call",
  "Left Voicemail",
  "No Answer",
] as const;

export const WORKING_STATUS = ["Still working", "Retired", "Not working"] as const;
export const MODALITIES = ["Zoom", "In person"] as const;
export const ADVISORS = ["Mike", "Chad"] as const;

export type CallCareSubmission = {
  token: string;
  callTime: string | null; // ISO datetime of the call (defaults to now on the client)
  connected: boolean;
  disposition: string | null;
  // Qualifying
  age: string | null;
  workingStatus: string | null;
  married: boolean;
  spouseAge: string | null;
  currentAdvisor: string | null;
  assetLocation: string | null;
  investableAssets: string | null;
  mainConcern: string | null;
  moneyGoal: string | null;
  questions: string | null;
  // Appointment (only when disposition === "Appointment Booked")
  apptDate: string | null;
  apptTime: string | null;
  modality: string | null;
  advisor: string | null;
  // Free notes
  notes: string | null;
};
