export type CueId =
  | "mismatched_domain"
  | "urgency"
  | "generic_greeting"
  | "suspicious_link"
  | "credential_request"
  | "spelling_errors"
  | "too_good_to_be_true"
  | "unexpected_attachment"
  | "impersonal_tone"
  | "threat_language"
  | "unusual_request"
  | "mismatched_display_name";

export const CUE_LABELS: Record<CueId, string> = {
  mismatched_domain: "Mismatched sender domain",
  urgency: "Urgency or pressure to act fast",
  generic_greeting: "Generic greeting (no personal name)",
  suspicious_link: "Suspicious or shortened link",
  credential_request: "Asks for a password or payment info",
  spelling_errors: "Spelling or grammar mistakes",
  too_good_to_be_true: "Too good to be true offer",
  unexpected_attachment: "Unexpected attachment",
  impersonal_tone: "Oddly formal or impersonal tone",
  threat_language: "Threatening consequences",
  unusual_request: "Unusual, out-of-process request",
  mismatched_display_name: "Display name doesn't match the address",
};

export const CUE_OPTIONS = (Object.keys(CUE_LABELS) as CueId[]).map((id) => ({
  id,
  label: CUE_LABELS[id],
}));
