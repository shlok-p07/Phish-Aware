/**
 * Non-interactive filler rows that sell the mailbox / messaging / call-log
 * metaphor around the scenario under test. Presentation fixtures only -- kept
 * out of the practice page so that file is about the practice flow.
 */
export interface DecoyRow {
  name: string;
  subject?: string;
  snippet: string;
  time: string;
}

/** Plausible arrival times, so a scenario doesn't always read as "just now". */
export const SCENARIO_TIMES = [
  "8:14 AM", "9:03 AM", "10:47 AM", "11:22 AM", "1:38 PM", "3:05 PM", "4:51 PM",
] as const;

export const INBOX_DECOYS: DecoyRow[] = [
  { name: "Google Calendar", subject: "Reminder: Team sync at 2:00 PM", snippet: "You have an event starting soon.", time: "7:45 AM" },
  { name: "GitHub", subject: "[phish-aware] 3 new pull requests", snippet: "Activity across repositories you follow.", time: "Yesterday" },
  { name: "LinkedIn", subject: "You appeared in 7 searches this week", snippet: "See who's been looking at your profile.", time: "Yesterday" },
  { name: "Spotify", subject: "Your Wrapped is almost here", snippet: "A year of listening, wrapped up for you.", time: "Mon" },
];

export const MESSAGE_DECOYS: DecoyRow[] = [
  { name: "Mom", snippet: "Don't forget to call grandma this weekend!", time: "9:12 AM" },
  { name: "Uber", snippet: "Your driver is 3 minutes away.", time: "Yesterday" },
  { name: "Chase Bank", snippet: "Your statement is ready to view.", time: "Mon" },
];

export const CALL_LOG_DECOYS: DecoyRow[] = [
  { name: "City Utilities", snippet: "Scheduled payment reminder.", time: "Yesterday" },
  { name: "Pharmacy Refill", snippet: "Your refill is ready for pickup.", time: "Mon" },
  { name: "School Office", snippet: "Attendance follow-up call.", time: "Mon" },
];
