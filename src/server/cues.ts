// Matches the shared phishaware-db schema spec's `cueType` enum exactly
// (phishaware-db/init/01-validators.js's `CUE` const) -- these ids are
// validated at the database layer, so they must stay in sync.
export type CueId =
  | "sender_domain"
  | "mismatched_link"
  | "urgency_language"
  | "generic_greeting"
  | "credential_request"
  | "spelling_grammar"
  | "unexpected_attachment"
  | "suspicious_qr";

export const CUE_LABELS: Record<CueId, string> = {
  sender_domain: "Mismatched sender domain",
  mismatched_link: "Suspicious or mismatched link",
  urgency_language: "Urgency or pressure to act fast",
  generic_greeting: "Generic greeting (no personal name)",
  credential_request: "Asks for a password or payment info",
  spelling_grammar: "Spelling or grammar mistakes",
  unexpected_attachment: "Unexpected attachment",
  suspicious_qr: "Suspicious QR code",
};

export const CUE_OPTIONS = (Object.keys(CUE_LABELS) as CueId[]).map((id) => ({
  id,
  label: CUE_LABELS[id],
}));
