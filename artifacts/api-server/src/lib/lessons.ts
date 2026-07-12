export interface LessonScreen {
  heading: string;
  body: string;
}

export interface Lesson {
  id: string;
  vector: "email" | "sms" | "voice" | "qr" | "social" | "website";
  title: string;
  summary: string;
  screens: LessonScreen[];
  redFlags: string[];
}

export const LESSONS: Lesson[] = [
  {
    id: "email-phishing",
    vector: "email",
    title: "Email Phishing",
    summary: "The classic con: a fake email designed to look like it's from someone you trust.",
    screens: [
      {
        heading: "What it is",
        body: "Email phishing impersonates a trusted sender -- your bank, IT department, or a coworker -- to trick you into clicking a link, opening an attachment, or handing over information.",
      },
      {
        heading: "Why it works",
        body: "Attackers borrow real logos, real-sounding domains, and a sense of urgency so you act before you think. A message that demands action 'right now' is a signal worth slowing down for.",
      },
      {
        heading: "How to check",
        body: "Hover over (don't click) links to preview the real destination. Check that the sender's domain exactly matches the company it claims to be from -- 'paypa1.com' is not 'paypal.com'.",
      },
    ],
    redFlags: ["mismatched_domain", "urgency", "credential_request", "generic_greeting"],
  },
  {
    id: "smishing",
    vector: "sms",
    title: "Smishing (SMS Phishing)",
    summary: "Phishing that arrives as a text message, often about a 'delivery' or 'account issue'.",
    screens: [
      {
        heading: "What it is",
        body: "Smishing uses text messages instead of email. A common lure is a fake delivery notice or a 'suspicious activity' alert with a link to a lookalike site.",
      },
      {
        heading: "Why it works",
        body: "Texts feel personal and immediate, and short links hide their real destination, so people click without a second thought.",
      },
      {
        heading: "How to check",
        body: "Never tap a link in an unexpected text. Go directly to the carrier or company's official app or website instead.",
      },
    ],
    redFlags: ["urgency", "suspicious_link", "unexpected_attachment"],
  },
  {
    id: "vishing",
    vector: "voice",
    title: "Vishing (Voice Phishing)",
    summary: "A phone call from someone pretending to be your bank, the IRS, or tech support.",
    screens: [
      {
        heading: "What it is",
        body: "Vishing is a phone call (or voicemail) where the caller impersonates a trusted institution to pressure you into sharing information or making a payment.",
      },
      {
        heading: "Why it works",
        body: "A confident voice, caller-ID spoofing, and manufactured urgency ('your account will be closed today') push people to comply before verifying anything.",
      },
      {
        heading: "How to check",
        body: "Hang up and call back using a number you look up yourself -- never one the caller gives you. Legitimate institutions won't ask for your password over the phone.",
      },
    ],
    redFlags: ["urgency", "threat_language", "credential_request", "unusual_request"],
  },
  {
    id: "quishing",
    vector: "qr",
    title: "Quishing (QR Code Phishing)",
    summary: "A malicious QR code -- on a poster, parking meter, or email -- that leads to a fake site.",
    screens: [
      {
        heading: "What it is",
        body: "Quishing hides a phishing link inside a QR code. Because you can't read a QR code before scanning it, it's an easy way to disguise a bad destination.",
      },
      {
        heading: "Why it works",
        body: "QR codes feel low-risk and are common in legitimate use (menus, payments), so people scan without scrutiny.",
      },
      {
        heading: "How to check",
        body: "After scanning, check the preview URL before opening it. Be wary of QR codes in unexpected places or ones stuck over an original code.",
      },
    ],
    redFlags: ["suspicious_link", "unusual_request", "too_good_to_be_true"],
  },
  {
    id: "social-media-scams",
    vector: "social",
    title: "Social Media Scams",
    summary: "Fake giveaways, cloned profiles, and DMs from 'friends' asking for money or codes.",
    screens: [
      {
        heading: "What it is",
        body: "Scammers clone profiles or run fake giveaway accounts to trick people into sending money, sharing verification codes, or clicking malicious links.",
      },
      {
        heading: "Why it works",
        body: "Seeing a familiar name or a flashy prize lowers your guard, and the informal tone of DMs makes requests feel less suspicious than an email would.",
      },
      {
        heading: "How to check",
        body: "Verify unusual requests from friends through another channel. Be skeptical of giveaways that ask you to pay a 'fee' or share a login code.",
      },
    ],
    redFlags: ["too_good_to_be_true", "unusual_request", "impersonal_tone"],
  },
  {
    id: "fake-websites",
    vector: "website",
    title: "Fake Websites",
    summary: "Lookalike sites built to harvest logins or payment details.",
    screens: [
      {
        heading: "What it is",
        body: "Fake websites mimic a real brand's design and domain closely enough to fool a quick glance, then capture whatever you type into their forms.",
      },
      {
        heading: "Why it works",
        body: "Visual polish and a near-identical URL make the site feel legitimate at a glance, especially on mobile where the address bar is easy to skim past.",
      },
      {
        heading: "How to check",
        body: "Check the full domain carefully, look for HTTPS, and type known URLs directly rather than following a link. When unsure, navigate to the site from a bookmark or search instead.",
      },
    ],
    redFlags: ["mismatched_domain", "credential_request", "spelling_errors"],
  },
];
