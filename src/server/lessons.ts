import type { LessonScreen } from "@/db/models/lessons";

export type { LessonScreen };

export interface Lesson {
  id: string;
  vector: "email" | "sms" | "voice" | "qr" | "social" | "web";
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
    summary:
      "How to read an email address, check where a link really goes, and spot the pressure that makes people skip both.",
    screens: [
      {
        heading: "The one thing attackers rely on",
        body:
          "Nearly every phishing email works the same way: it looks like it came from someone you already trust, and it asks you to do something quickly. That is the whole trick. You do not need to be technical to catch it. You need to know which two things to look at, and to look at them before you act.\n\nThose two things are the sender's real address and where the link actually goes. This lesson shows you exactly where to find each one and what a bad one looks like.",
      },
      {
        kind: "anatomy",
        heading: "Where to look on a real example",
        intro:
          "Below is a message of the kind that reaches inboxes every day. Nothing about it looks alarming at a glance, which is the point. Each numbered note points at one detail and explains what it tells you.",
        sample: {
          displayName: "Microsoft 365 Support",
          address: "no-reply@ms365-secure-billing.com",
          subject: "Action required: your mailbox will be closed in 24 hours",
          body:
            "Dear User,\n\nOur records show your mailbox licence has expired. To avoid losing access to your email and files, please confirm your account details within 24 hours.\n\nMicrosoft 365 Support Team",
          linkText: "Confirm my account",
          linkHref: "https://ms365-secure-billing.com/verify/login",
        },
        callouts: [
          {
            target: "displayName",
            detail:
              "The name shown here is typed by whoever sent the message. It is not checked by anyone. An attacker can put \"Microsoft 365 Support\" or your manager's name in this field as easily as you can type it into a document. Never treat this name as proof of anything.",
          },
          {
            target: "address",
            detail:
              "This is the part that matters. Read it right to left: the piece immediately before \".com\" is the real owner. Here that is \"ms365-secure-billing\", which is a domain someone registered -- it is not microsoft.com. Genuine Microsoft mail comes from microsoft.com. Extra words joined by hyphens are the most common way of making a fake domain look official.",
          },
          {
            target: "subject",
            detail:
              "A deadline in the subject line exists to stop you checking. Real providers do not close a mailbox in 24 hours over billing, and they do not need you to hurry. If a message is pressing you to act fast, that is itself the reason to slow down.",
          },
          {
            target: "body",
            detail:
              "\"Dear User\" tells you the sender does not know your name. An organisation you actually have an account with knows it. A greeting that would fit anybody was written to be sent to everybody.",
          },
          {
            target: "link",
            detail:
              "The words on a link are just words. The address underneath is where you would actually be taken, and here it is the same invented domain as the sender. On a computer, rest your mouse on a link without clicking and the real address appears at the bottom of the window. On a phone, press and hold it.",
          },
        ],
      },
      {
        kind: "compare",
        heading: "The same message, genuine and fake",
        intro:
          "The differences are small and they are always in the same places. Once you have seen them side by side they are hard to miss again.",
        rows: [
          {
            label: "Sender address",
            genuine: "account-security-noreply@accountprotection.microsoft.com",
            fake: "no-reply@ms365-secure-billing.com",
            note:
              "The genuine one ends in microsoft.com. Everything before that is decoration and can say anything. The fake one ends in a domain that has nothing to do with Microsoft.",
          },
          {
            label: "Greeting",
            genuine: "Hello Margaret,",
            fake: "Dear User,",
            note: "A company you hold an account with knows your name.",
          },
          {
            label: "What it asks",
            genuine: "Review recent activity when convenient.",
            fake: "Confirm your account details within 24 hours.",
            note: "Genuine notices inform you. Fakes give you a deadline.",
          },
          {
            label: "Where the link goes",
            genuine: "https://account.microsoft.com/security",
            fake: "https://ms365-secure-billing.com/verify/login",
            note:
              "Read both right to left, at the part before the first single slash. One is microsoft.com. The other is not.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "Four checks, in this order",
        intro:
          "These take about fifteen seconds in total and they do not require you to understand anything technical. Do them before clicking, not after.",
        steps: [
          {
            action: "Read the sender's actual address, not the name.",
            lookFor:
              "The piece directly before .com, .co.uk or .org. That is who really sent it.",
            warningSign:
              "A well-known company's name appears earlier in the address but the ending belongs to something else, often joined up with hyphens.",
          },
          {
            action: "Check how it greets you.",
            lookFor: "Your actual name.",
            warningSign: "\"Dear User\", \"Dear Customer\", or no greeting at all.",
          },
          {
            action: "Rest your mouse on any link without clicking.",
            lookFor:
              "The address that appears at the bottom of the screen. On a phone, press and hold instead.",
            warningSign:
              "The address does not match the company, or the words on the link say one thing and the address says another.",
          },
          {
            action: "Notice how the message is making you feel.",
            lookFor: "A calm request you could act on tomorrow.",
            warningSign:
              "Fear, a deadline, a threat of losing access, or a reward for acting now. Urgency is the tool, not a side effect.",
          },
        ],
      },
      {
        kind: "checkpoint",
        heading: "Before you move on",
        prompt:
          "An email arrives from \"HR Department\" at the address hr@yourcompany-benefits.net. Your employer's website is yourcompany.com. It asks you to log in to confirm your pension details today. What is the strongest single reason to be suspicious?",
        options: [
          {
            label: "The sender's domain is not your employer's",
            correct: true,
            feedback:
              "Correct, and this is the check that catches the most attacks. The address ends in yourcompany-benefits.net, which is a domain somebody registered. Your employer is yourcompany.com. The words \"HR Department\" were simply typed in.",
          },
          {
            label: "HR would never email about pensions",
            correct: false,
            feedback:
              "Not quite. HR emails about pensions all the time, and a real notice like this would be entirely normal. What gives this one away is the domain: yourcompany-benefits.net is not yourcompany.com. Judge the address, not the topic.",
          },
        ],
      },
    ],
    redFlags: ["sender_domain", "urgency_language", "credential_request", "generic_greeting"],
  },
  {
    id: "smishing",
    vector: "sms",
    title: "Smishing (SMS Phishing)",
    summary:
      "Why a text is harder to check than an email, how to read the number it came from, and what to do instead of tapping the link.",
    screens: [
      {
        heading: "Why a text gets through when an email would not",
        body:
          "Your work email has filters in front of it. A text message does not. It arrives on the device you keep in your pocket, next to your boarding passes and the codes your bank sends you, and it arrives while you are walking somewhere or halfway through something else.\n\nA text also gives you less to check than an email does. There is no company signature, no display name, and no full web address -- links in texts are shortened on purpose so they fit, which means the destination is hidden even when the message is genuine.\n\nSo the skill here is not \"spot the fake\". It is narrower than that: never act inside the message. Everything a real text asks you to do can be done by opening the company's own app yourself.",
      },
      {
        kind: "annotated",
        heading: "Read one line by line",
        intro:
          "This is the most common smishing message in the world -- a parcel that cannot be delivered until you pay a small fee. Hover or tap each note to see which part of the message it is talking about.",
        frame: "Text message",
        parts: [
          { id: "from", label: "From", value: "+63 917 555 0142", mono: true },
          {
            id: "body",
            value:
              "ROYAL MAIL: Your parcel is being held. An unpaid shipping fee of 1.99 GBP is required. Confirm within 24 hours or your item will be returned.",
          },
          { id: "link", value: "royalmail-redelivery.info/fee", mono: true },
        ],
        callouts: [
          {
            target: "from",
            label: "The number it came from",
            detail:
              "A courier operating in your country does not text you from a mobile number in another one. Real companies send from a short code -- five or six digits -- or from a name like \"ROYALMAIL\", and they use the same one every time. A long unfamiliar number is the single most reliable tell in a text message. It is also the one people skip, because the phone shows the message before you ever look at who sent it.",
          },
          {
            target: "body",
            label: "The amount is small on purpose",
            detail:
              "1.99 is chosen to be beneath the amount you would stop and think about. The point of the fee is not the fee -- it is to get your card number and address onto the next screen. Ask what they actually end up with, not what they are asking for.",
          },
          {
            target: "link",
            label: "The address is not the company",
            detail:
              "Read the part immediately before the first single slash: \"royalmail-redelivery.info\". That is the real owner of the site. Royal Mail's own address is royalmail.com. Anyone can register a name with the company's name inside it -- putting a brand before a hyphen costs a few pounds and proves nothing.",
          },
          {
            target: "body",
            label: "It does not know who you are",
            detail:
              "No name, and no parcel or tracking number -- because whoever sent it does not know whether you are expecting a delivery. It was sent to thousands of numbers at once. A real notification can tell you what it is about.",
          },
        ],
      },
      {
        kind: "compare",
        heading: "The genuine version of the same message",
        intro:
          "Real couriers do send texts. Here is what the same four things look like when the message is authentic.",
        rows: [
          {
            label: "Who it comes from",
            genuine: "A short code or a fixed sender name, the same one each time",
            fake: "A long mobile number, often from another country",
            note:
              "Save the genuine one in your contacts the first time you get it. After that a real message is obvious because it lands in an existing thread.",
          },
          {
            label: "What it knows about you",
            genuine: "Your tracking number, and often what you ordered",
            fake: "Nothing specific -- \"your parcel\", \"your item\"",
            note: "A company that is delivering to you knows what it is delivering.",
          },
          {
            label: "What it asks for",
            genuine: "Nothing, or it points you to the app to pick a delivery slot",
            fake: "A payment or your card details, inside a link",
            note:
              "Couriers collect fees at the door or in the app, never through a link in a text.",
          },
          {
            label: "The link",
            genuine: "The company's own address, or no link at all",
            fake: "The brand name bolted onto a different domain",
            note: "The last two parts before the first slash are the only bit that matters.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "What to do with a text like this",
        intro:
          "These are in order. The first one is the whole lesson; the rest are what to do instead.",
        steps: [
          {
            action: "Do not tap the link. Not even to look.",
            lookFor: "The urge to check quickly because it is only a small amount.",
            warningSign:
              "If you have already tapped, do not type anything into the page. Just close it.",
          },
          {
            action: "Open the company's own app, or type its address yourself.",
            lookFor: "The same notice waiting for you there, if it is real.",
            warningSign:
              "Nothing in the app about a held parcel or an unpaid fee means the text was fake.",
          },
          {
            action: "Check the number against a message you know is genuine.",
            lookFor: "An existing thread from that company on your phone.",
            warningSign: "A new thread from an unknown number claiming to continue an old matter.",
          },
          {
            action: "Report it, then delete it.",
            lookFor: "Your organisation's reporting route -- forwarding to IT is usually enough.",
            warningSign:
              "Deleting without reporting. If it reached you it reached your colleagues, and they may not have read this lesson.",
          },
        ],
      },
      {
        kind: "checkpoint",
        heading: "Check yourself",
        prompt:
          "A text says it is from your bank. You compare the number it came from against the one printed on the back of your card, and they match exactly. Is that proof the text is genuine?",
        options: [
          {
            label: "No -- the number shown can be faked",
            correct: true,
            feedback:
              "Correct, and this is the part that surprises people most. The sender name and number attached to a text are just data the sender fills in; there is no check on them anywhere in the phone network. Making a message appear to come from your bank's real number is a routine capability, not an advanced one. It is called spoofing, and it is why the number is never the deciding factor -- what you do next is. Call the bank on the number you looked up yourself.",
          },
          {
            label: "Yes -- a matching number confirms the sender",
            correct: false,
            feedback:
              "This is the most common and most costly assumption in this whole lesson. The number attached to a text is filled in by whoever sends it, and nothing in the phone network verifies it. A faked message can land in the same thread as your bank's real ones, directly underneath a genuine message, which is exactly what makes it convincing. Treat a matching number as meaning nothing at all, and verify by calling a number you looked up yourself.",
          },
        ],
      },
    ],
    redFlags: ["urgency_language", "mismatched_link", "credential_request", "generic_greeting"],
  },
  {
    id: "vishing",
    vector: "voice",
    title: "Vishing (Voice Phishing)",
    summary:
      "What a scam call actually sounds like, why a live human is harder to resist than an email, and the one move that defeats all of them.",
    screens: [
      {
        heading: "Why a call is harder than an email",
        body:
          "An email waits for you. You can read it twice, show it to someone, come back after lunch. A call does none of that. Someone is on the line, they are waiting for your answer, and staying silent while you think feels rude.\n\nThat is the actual weapon. Not technology -- politeness, and the fact that you cannot re-read a phone call. A caller can also adapt: if you sound doubtful they change tack, if you mention a colleague's name they use it a minute later.\n\nThere is one move that beats every version of this, and it does not require you to work out whether the caller is genuine: end the call and ring back on a number you found yourself. A real caller is never inconvenienced by that. Someone pretending will do a great deal to stop you.",
      },
      {
        kind: "annotated",
        heading: "A real call, line by line",
        intro:
          "This is a transcript of the caller's side only. Read it once through, then hover each note -- the line it is about will light up.",
        frame: "Call transcript",
        parts: [
          { id: "cid", label: "Caller ID", value: "Bank Security", mono: true },
          {
            id: "l1",
            value:
              "Caller: Good afternoon, I'm calling from the fraud team. Am I speaking with the account holder?",
          },
          {
            id: "l2",
            value:
              "Caller: We've stopped two payments on your card in the last hour, one for 840 pounds. I need to confirm it wasn't you before the account locks.",
          },
          {
            id: "l3",
            value:
              "Caller: Please don't hang up -- if you do, the transaction goes through and I can't reverse it from my side.",
          },
          {
            id: "l4",
            value:
              "Caller: I'm sending a verification code to your phone now. Read it back to me and I'll cancel the payment.",
          },
        ],
        callouts: [
          {
            target: "cid",
            label: "\"Bank Security\" is typed, not verified",
            detail:
              "The label on an incoming call is supplied by whoever is calling. Any name or number can be attached to it, including your bank's real one. Your phone displays it without checking anything. So the caller ID tells you what the caller wants you to see, and nothing more.",
          },
          {
            target: "l1",
            label: "They ask; they do not tell",
            detail:
              "\"Am I speaking with the account holder?\" gets you to confirm who you are without them knowing anything. Every real fraud team already has your details in front of them -- they open by telling you which account they are calling about. Notice how much of this call is questions.",
          },
          {
            target: "l2",
            label: "A number large enough to alarm you",
            detail:
              "840 pounds is picked to produce a reaction and to start a clock. Alarm is what stops you doing the one thing that would end the call safely. If you notice yourself feeling rushed, that feeling is the attack working, and it is your cue to stop rather than hurry.",
          },
          {
            target: "l3",
            label: "This line is the tell",
            detail:
              "This is the giveaway, and it is worth remembering above everything else on this screen. No genuine bank has ever needed you to stay on the line. Nothing at your bank depends on the call continuing. A caller who tells you that hanging up will cost you money is telling you that hanging up will cost them their attempt.",
          },
          {
            target: "l4",
            label: "The code is the whole point of the call",
            detail:
              "Everything before this line exists to get to this line. That code is what logs someone into your account, and the code your bank sends says in the message itself that nobody should ever ask for it. No employee of any real institution will ever ask you to read one out. If a call reaches this point, you already have your answer.",
          },
        ],
      },
      {
        kind: "compare",
        heading: "What a genuine fraud call is like",
        intro:
          "Banks do phone people about real fraud. The difference is not in how professional the caller sounds.",
        rows: [
          {
            label: "Who does the identifying",
            genuine: "They tell you which account and which card ending",
            fake: "They ask you to confirm who you are",
            note: "Information should be flowing towards you at the start of the call, not away.",
          },
          {
            label: "Hanging up",
            genuine: "Fine. They will tell you to call the number on your card",
            fake: "Discouraged, with a consequence attached",
            note: "Any resistance to you hanging up settles the question on its own.",
          },
          {
            label: "Codes and passwords",
            genuine: "Never asked for, in any form",
            fake: "Asked for, framed as confirming your identity",
            note: "There is no legitimate version of reading a code to a caller.",
          },
          {
            label: "Time pressure",
            genuine: "None. A blocked payment stays blocked",
            fake: "Minutes or seconds, always",
            note: "Real security systems are designed to wait for you.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "What to do while the call is still happening",
        intro:
          "You do not have to be certain, or clever, or rude. You only have to do this.",
        steps: [
          {
            action: "Say you will call back, then hang up.",
            lookFor: "\"I'm going to ring you back on the number on my card.\" Then end the call.",
            warningSign:
              "Any reason you should not do that. There is no real reason, so any reason given is the answer.",
          },
          {
            action: "Find the number yourself.",
            lookFor: "The back of your card, a statement, or the official app.",
            warningSign:
              "Using a number the caller gave you, or one from a search result advert.",
          },
          {
            action: "Wait, or use a different phone if you can.",
            lookFor: "A clear line and a dial tone before you ring.",
            warningSign:
              "The previous call not actually having ended. If in doubt, wait a minute before dialling.",
          },
          {
            action: "Never read out a code, a password, or a card number.",
            lookFor: "The wording of the code message itself -- it says not to share it.",
            warningSign:
              "Being told this once is a normal part of confirming your identity. It is not.",
          },
          {
            action: "Tell IT or your bank what happened, even if you gave nothing away.",
            lookFor: "The time of the call and the number shown.",
            warningSign:
              "Assuming it does not matter because it did not work. The same caller is working through your colleagues.",
          },
        ],
      },
      {
        kind: "checkpoint",
        heading: "Check yourself",
        prompt:
          "You say you would rather call the bank back yourself. The caller says that is a good idea, and offers to stay on the line quietly while you look the number up. Do you accept?",
        options: [
          {
            label: "No -- end the call completely first",
            correct: true,
            feedback:
              "Correct. Staying on the line is the trick, and it is designed to survive exactly the sensible instinct you just had. If the call never ends, dialling can be intercepted, and you may hear a convincing hold tone and a second colleague who is part of the same attempt. Agreeing feels like the cautious option, which is why it is offered. Hang up fully, wait a moment, and dial from your card.",
          },
          {
            label: "Yes -- they are being cooperative",
            correct: false,
            feedback:
              "This is the version of the scam that catches careful people, so it is worth understanding rather than just remembering. A caller who cannot talk you out of verifying will instead offer to help you do it, because the attack only needs the line to stay open. What sounds like cooperation is the last move available to them. Hang up fully, wait a moment, then dial the number on your card.",
          },
        ],
      },
    ],
    redFlags: ["urgency_language", "credential_request", "generic_greeting"],
  },
  {
    id: "quishing",
    vector: "qr",
    title: "Quishing (QR Code Phishing)",
    summary:
      "Why a printed square is a uniquely good hiding place for a bad link, and how to check one before you scan it.",
    screens: [
      {
        heading: "The one attack you cannot look at",
        body:
          "You can read an email address. You can read a link if you hover over it. You cannot read a QR code -- not because it is technical, but because it is not written in anything a person can see. That is the entire appeal of it.\n\nTwo other things make it worse. A QR code is printed, so it does not pass through any of the filters that protect your email; and scanning one moves you onto your own phone, off the company network, where none of your employer's protections apply.\n\nAnd a sticker costs almost nothing. A great many quishing attacks are just a printed square stuck neatly over a real one on a poster, a parking meter or a payment terminal that has been there for years.",
      },
      {
        kind: "annotated",
        heading: "A notice worth a second look",
        intro:
          "This one was found taped inside a lift in an office building. Everything about it is ordinary, which is why it worked. Hover each note.",
        frame: "Posted notice",
        parts: [
          { id: "org", label: "Appears to be from", value: "Facilities Management" },
          { id: "head", label: "Headline", value: "Parking permit renewal -- action required" },
          {
            id: "body",
            value:
              "All staff permits expire on Friday. Scan the code below to renew. Vehicles without a valid permit from Monday will be issued a 60 charge by the site operator.",
          },
          { id: "dest", label: "The code leads to", value: "https://staff-permits-renew.info/login", mono: true },
        ],
        callouts: [
          {
            target: "org",
            label: "A department, but not a person",
            detail:
              "\"Facilities Management\" is a real-sounding name with nobody attached to it. There is no extension to ring and no name to ask for, so there is nothing to check and nobody to be caught out by. A genuine internal notice almost always names someone or gives an internal contact.",
          },
          {
            target: "dest",
            label: "Read the address right to left",
            detail:
              "The owner of the site is the last two parts before the first single slash: \"staff-permits-renew.info\". That is not your employer's web address, and your employer's parking would live on your employer's own site. This is the check that actually decides it -- and on this vector you have to make the phone show you the address before you can do it.",
          },
          {
            target: "body",
            label: "A deadline and a fine",
            detail:
              "A named amount and a date that is close enough to be inconvenient. This is the same pressure a phishing email uses, and it exists for the same reason: to get you scanning now rather than asking a colleague on Monday.",
          },
          {
            target: "head",
            label: "\"Action required\" on a wall",
            detail:
              "Phrases like this belong in emails. Printed on a notice in a lift, it is doing the same job -- creating a task with a deadline that you feel you have now been told about, so ignoring it feels like your fault.",
          },
        ],
      },
      {
        kind: "compare",
        heading: "Genuine notices and fake ones",
        intro: "Your employer does put up notices with codes on them. Here is what differs.",
        rows: [
          {
            label: "Where the code goes",
            genuine: "Your employer's own web address",
            fake: "A separate domain with employer-ish words in it",
            note: "Preview the address before opening it -- every modern phone shows it.",
          },
          {
            label: "Who to ask",
            genuine: "A named person, team or extension",
            fake: "A department name and nothing else",
            note: "If there is nobody to ask, ask anyway -- through a channel you already use.",
          },
          {
            label: "The physical notice",
            genuine: "Printed as one piece, matching other notices",
            fake: "A code stuck on separately, sometimes over another one",
            note:
              "Run a fingernail over the corner of the code. A sticker over a printed code is the most common form this takes.",
          },
          {
            label: "What happens after scanning",
            genuine: "Information, or a page you were already signed into",
            fake: "A login form asking for your work credentials",
            note: "Being asked to sign in after scanning a poster is the point to stop.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "How to check a code before you scan it",
        intro: "The first two take about five seconds between them.",
        steps: [
          {
            action: "Look at the code as an object.",
            lookFor: "Whether it is printed with the notice or stuck on top of it.",
            warningSign: "A raised edge, a slight colour difference, or a code that is not square to the page.",
          },
          {
            action: "Point your camera, but read before you open.",
            lookFor: "The address your phone previews. Read it right to left.",
            warningSign: "Opening the preview by reflex. The preview only helps if you read it.",
          },
          {
            action: "If it wants you to sign in, stop.",
            lookFor: "Any request for your work username and password.",
            warningSign:
              "A login page that looks exactly right. It is meant to -- the design is copied.",
          },
          {
            action: "Do it the long way instead.",
            lookFor: "The same task on your employer's intranet, or an email to the team.",
            warningSign:
              "Deciding it is not worth the effort. That calculation is what the notice is counting on.",
          },
          {
            action: "Report the notice, and say where it was.",
            lookFor: "The floor, the wall, the lift -- somebody has to go and take it down.",
            warningSign: "Assuming someone else has already reported it. Usually nobody has.",
          },
        ],
      },
      {
        kind: "checkpoint",
        heading: "Check yourself",
        prompt:
          "You scan a code on a poster and your phone shows you the web address before opening it. Does previewing the address keep you safe?",
        options: [
          {
            label: "Only if I actually read the domain",
            correct: true,
            feedback:
              "Correct. The preview is necessary but it is not the protection -- reading it is. Most people glance at a preview and tap through, especially when the address contains a brand name they recognise. Find the last two parts before the first single slash and ask whether that is really the organisation you expect. \"microsoft.com.verify-login.net\" previews perfectly well and belongs to verify-login.net.",
          },
          {
            label: "Yes -- the preview is the safeguard",
            correct: false,
            feedback:
              "The preview only shows you the address; it does not judge it, and that is the gap these attacks live in. An address engineered to contain a familiar brand name looks reassuring in a preview, which is precisely why the brand is put there. Read the last two parts before the first single slash and decide whether that is the organisation you expect -- \"microsoft.com.verify-login.net\" belongs to verify-login.net.",
          },
        ],
      },
    ],
    redFlags: ["suspicious_qr", "mismatched_link", "urgency_language", "credential_request"],
  },
  {
    id: "social-media-scams",
    vector: "social",
    title: "Social Media and Messaging Scams",
    summary:
      "How a fake profile is built, why a recruiter message is such an effective disguise, and what to check before you reply.",
    screens: [
      {
        heading: "Why this one gets past sensible people",
        body:
          "A message on a professional network does not feel like an attack. It feels like your career. Someone has looked at your profile, they think you would be a good fit, and they would like to talk. That is a completely normal thing to happen, which is what makes a fake one so hard to notice.\n\nBuilding the disguise is easy. A photograph, a job title and a plausible history take about ten minutes to assemble, and the details can be copied from a real employee of the company being impersonated. Meanwhile everything the attacker needs to sound convincing about you -- where you work, what you do, who you report to -- is on your own profile, put there by you for good reasons.\n\nWhat cannot be faked is the profile's history: who else knows this person, and how long it has existed. That is what to look at.",
      },
      {
        kind: "annotated",
        heading: "A message worth examining",
        intro:
          "This arrived on a Tuesday afternoon, unprompted. Hover each note to see the part it refers to.",
        frame: "Direct message",
        parts: [
          { id: "name", label: "From", value: "Dana Whitfield -- Senior Talent Partner" },
          { id: "handle", label: "Profile", value: "@d.whitfield-recruiting", mono: true },
          {
            id: "msg",
            value:
              "Hi! I came across your profile and you're a strong match for a senior role we're hiring for -- fully remote, and the band is well above what you're on now. I can send the spec over. Easier to chat on WhatsApp, my number is in my profile. Could you fill in this short form first so I can register your interest before Friday?",
          },
          { id: "link", label: "Link", value: "talent-verify.co/apply/register", mono: true },
        ],
        callouts: [
          {
            target: "handle",
            label: "The handle belongs to nobody",
            detail:
              "A recruiter working for a company usually has that company somewhere in their profile. \"d.whitfield-recruiting\" is a name that sounds professional while belonging to no organisation you can go and check. Names cost nothing; verifiable affiliations do not.",
          },
          {
            target: "msg",
            label: "Moving you off the platform",
            detail:
              "This is the most reliable single tell in the message. On the network there is a profile, a history, and a report button. On WhatsApp there is none of that, and the conversation cannot be reviewed by anyone afterwards. A genuine recruiter has no reason to need this in the first ten minutes.",
          },
          {
            target: "msg",
            label: "Pay mentioned before the job",
            detail:
              "\"Well above what you're on now\" appears before any description of the work. It is there to make you want the conversation to be real -- and once you want that, you check less. Notice that the message never actually says what the job is.",
          },
          {
            target: "link",
            label: "A form before a conversation",
            detail:
              "Real hiring starts with a conversation and an application on the employer's own careers site. A form on a separate domain, filled in before anyone has told you what the role is, is a collection exercise. Read the domain: \"talent-verify.co\" is not a company you were talking to.",
          },
          {
            target: "msg",
            label: "A deadline, in a first message",
            detail:
              "\"Before Friday\" does the same work here as \"within 24 hours\" does in a phishing email. Hiring does not run to deadlines that arrive before the job description.",
          },
        ],
      },
      {
        kind: "compare",
        heading: "A real recruiter beside a fake one",
        intro: "Recruiters really do send cold messages. These are the differences that hold up.",
        rows: [
          {
            label: "The profile",
            genuine: "Years of history, a named employer, many mutual connections",
            fake: "Created recently, few connections, none in common with you",
            note: "Profile age and mutual connections are the two hardest things to fake.",
          },
          {
            label: "Where it stays",
            genuine: "On the platform, or moves to company email",
            fake: "Pushes quickly to WhatsApp, Telegram or a personal number",
            note: "Ask to keep it on the platform. A real recruiter will not mind.",
          },
          {
            label: "Where you apply",
            genuine: "The employer's own careers site",
            fake: "A form on an unrelated domain",
            note: "Go to the company's site yourself and search for the role.",
          },
          {
            label: "What is asked for, and when",
            genuine: "A CV, and later a conversation",
            fake: "ID documents, bank details or a verification code, early",
            note: "Nobody needs your passport to discuss a role you have not been offered.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "How to check before you reply",
        intro: "None of this requires you to be rude, or to decide the person is a fraud.",
        steps: [
          {
            action: "Look at the profile before the message.",
            lookFor: "How long it has existed, and who you both know.",
            warningSign: "No mutual connections at all, and a history that starts this year.",
          },
          {
            action: "Verify the person against the company, not the other way round.",
            lookFor: "Their name on the employer's own site or careers page.",
            warningSign:
              "Only being able to confirm them from the profile itself. That is circular -- it is the thing you are checking.",
          },
          {
            action: "Keep the conversation where it started.",
            lookFor: "A reply that is happy to stay on the platform.",
            warningSign: "Any push to a private number, especially early.",
          },
          {
            action: "Apply through the employer's site, never through a sent link.",
            lookFor: "The same role listed there.",
            warningSign:
              "The role not existing on their careers page. That settles it on its own.",
          },
          {
            action: "Never send documents or codes in a message.",
            lookFor: "What is actually being collected, rather than the reason given.",
            warningSign:
              "\"Just to verify you\" attached to a passport, a bank detail or a login code.",
          },
        ],
      },
      {
        kind: "checkpoint",
        heading: "Check yourself",
        prompt:
          "You look up the person messaging you. Their photograph, job title and employer all match a real person who genuinely works at that company. Does that confirm the message is genuine?",
        options: [
          {
            label: "No -- all three of those can be copied",
            correct: true,
            feedback:
              "Correct. A photograph, a title and an employer are public information, and copying them into a new profile is the standard way these are built -- impersonating a real employee is more convincing than inventing one. What cannot be copied is the account's own history: when it was created, and who else is connected to it. Check those, and verify the person through the company rather than through the profile.",
          },
          {
            label: "Yes -- a real person confirms it",
            correct: false,
            feedback:
              "Understandably tempting, but it inverts the check. Impersonating a real employee is easier and more convincing than inventing a fictional one, because everything you just verified is published for anyone to copy. You have confirmed that the person exists, not that you are talking to them. What is hard to fake is the account's history -- its age and its mutual connections -- so look at those, and reach the person through the company's own site.",
          },
        ],
      },
    ],
    redFlags: ["sender_domain", "mismatched_link", "urgency_language", "credential_request"],
  },
  {
    id: "fake-websites",
    vector: "web",
    title: "Fake Websites",
    summary:
      "How to read a web address properly, why the padlock does not mean what people think, and what to do if you have already typed your password in.",
    screens: [
      {
        heading: "The page is a copy. The address cannot be.",
        body:
          "A convincing fake sign-in page takes very little effort, because it does not have to be built. The real page can be saved and re-hosted, so the logo, the fonts, the spacing and the wording are not merely similar -- they are the same file. There is nothing to spot in the design, and looking for something is wasted effort.\n\nOne thing genuinely cannot be copied: the address. Only one organisation in the world can hold microsoft.com. Everything else is an attempt to make a different address feel like that one.\n\nSo this lesson is one skill. Reading a web address in the right order, and knowing which part of it decides who owns the page.",
      },
      {
        kind: "annotated",
        heading: "Reading the address",
        intro:
          "This page is an exact copy of a real sign-in screen. Hover each note; the part it refers to will light up.",
        frame: "Browser",
        parts: [
          {
            id: "url",
            label: "Address",
            value: "https://login.microsoftonline.com.session-verify.net/auth",
            mono: true,
          },
          { id: "head", label: "Page heading", value: "Sign in to continue" },
          {
            id: "body",
            value:
              "Your session has expired. Please confirm your credentials to restore access to your mailbox and files.",
          },
        ],
        callouts: [
          {
            target: "url",
            label: "Find the first single slash",
            detail:
              "Everything that decides who owns this page sits between \"https://\" and the first single slash after it. Here that is \"login.microsoftonline.com.session-verify.net\". The path after the slash is chosen by the site owner and can say anything at all, so it is not evidence of anything.",
          },
          {
            target: "url",
            label: "Then read backwards from there",
            detail:
              "Take the last two parts before that slash: \"session-verify.net\". That is the owner. Everything to the left of it -- including \"microsoftonline.com\" -- is a subdomain, and subdomains are free for the owner to name however they like. They could have written \"yourbank.com\" there just as easily. This is the single most useful habit in this entire course: read right to left, and stop at the second part.",
          },
          {
            target: "head",
            label: "Nothing here can help you",
            detail:
              "The heading, the logo and the layout are copied from the genuine page, often the exact files. Trying to spot a design flaw is looking for something that is not there. Give the page no weight at all and go straight to the address.",
          },
          {
            target: "body",
            label: "A reason you cannot check",
            detail:
              "\"Your session has expired\" is unfalsifiable and mildly plausible at any moment of any day. It exists to explain why you are being asked to sign in again, because that request is the one thing that might otherwise make you pause.",
          },
        ],
      },
      {
        kind: "compare",
        heading: "Four addresses, one genuine",
        intro:
          "All four of these have been used in real attacks. Only the first belongs to Microsoft.",
        rows: [
          {
            label: "The genuine form",
            genuine: "login.microsoftonline.com/auth",
            fake: "login.microsoftonline.com.session-verify.net/auth",
            note:
              "The fake reads identically from the left. Read from the right instead: session-verify.net.",
          },
          {
            label: "A swapped character",
            genuine: "microsoft.com",
            fake: "micros0ft.com",
            note: "A zero for an o. At normal reading speed these are the same shape.",
          },
          {
            label: "A brand before a hyphen",
            genuine: "microsoft.com",
            fake: "microsoft-verify.com",
            note: "A different domain entirely. A hyphen joins nothing; it just reads well.",
          },
          {
            label: "The padlock",
            genuine: "Present -- means the connection is encrypted",
            fake: "Also present -- means the same thing",
            note:
              "Certificates are free and issued to whoever owns the domain, including attackers. The padlock says nobody can read your traffic. It says nothing about who receives it.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "What to do on a page asking you to sign in",
        intro:
          "The last step matters most, because sooner or later everybody gets one of these wrong.",
        steps: [
          {
            action: "Stop before typing anything.",
            lookFor: "How you arrived -- a link in a message, or your own bookmark.",
            warningSign:
              "Having arrived from a link and being asked to sign in. That combination is the whole attack.",
          },
          {
            action: "Read the address right to left.",
            lookFor: "The last two parts before the first single slash.",
            warningSign:
              "A familiar brand name appearing anywhere other than in those two parts.",
          },
          {
            action: "Leave, and arrive again on your own.",
            lookFor: "Your bookmark, your password manager, or typing the address yourself.",
            warningSign:
              "Deciding it is probably fine because the page looks right. It will always look right.",
          },
          {
            action: "Notice if your password manager stays quiet.",
            lookFor: "It filling in credentials without being asked.",
            warningSign:
              "Having to copy a password across by hand. Your manager matches on the domain, so its silence is a real signal.",
          },
          {
            action: "If you have already typed it in: change that password now, then tell IT.",
            lookFor: "Everywhere else you used the same password. Change those too.",
            warningSign:
              "Waiting because you feel embarrassed. The delay is the only part that causes real damage, and reporting fast is the most useful thing anybody on this course can do.",
          },
        ],
      },
      {
        kind: "checkpoint",
        heading: "Check yourself",
        prompt:
          "You are on a page at https://microsoft.com.account-verify.net/login. It shows a padlock and looks exactly like the Microsoft sign-in page. Whose page is it?",
        options: [
          {
            label: "account-verify.net -- not Microsoft",
            correct: true,
            feedback:
              "Correct. Take the last two parts before the first single slash: account-verify.net. That is the owner. \"microsoft.com\" sitting in front of it is just a subdomain the owner chose, exactly as they could have chosen \"yourbank.com\". The padlock is genuine and irrelevant -- it confirms the connection is encrypted, not who is at the other end. Read right to left, stop at the second part, and you will catch every variant of this.",
          },
          {
            label: "Microsoft -- the domain and the padlock both check out",
            correct: false,
            feedback:
              "This is the exact confusion the address is built to produce, so it is worth walking through. Ownership is decided by the last two parts before the first single slash: here that is account-verify.net. \"microsoft.com\" in front of it is a subdomain, free for that owner to name anything, including a real company's domain. The padlock only means the connection is encrypted -- certificates are free and issued to whoever owns the domain. Read right to left and stop at the second part.",
          },
        ],
      },
    ],
    redFlags: ["sender_domain", "mismatched_link", "credential_request", "urgency_language"],
  },
];
