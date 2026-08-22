import { NextRequest } from "next/server";
import { organizationsCollection } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { recordAudit } from "@/server/audit";
import { parseDomainInput } from "@/server/sso/domain";
import { toOrgDtoWithSeats } from "@/server/org";
import {
  BrandingError,
  parseAccentColor,
  parseHttpsUrl,
  parsePracticeVectors,
  parseReportingChannel,
  MAX_REPORTING_INSTRUCTIONS,
  parsePlainText,
  MAX_WELCOME_MESSAGE,
} from "@/server/orgBranding";

export const dynamic = "force-dynamic";

/**
 * An upper bound so a typo cannot set a limit that stops functioning as one.
 * A customer who genuinely needs more than this is a conversation, not a form
 * field.
 */
const MAX_SEAT_LIMIT = 100_000;

/** Long enough for any real legal name, short enough to stay renderable. */
const MAX_NAME_LENGTH = 120;

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await readJsonBody(req)) as {
    name?: string;
    ssoDomain?: string;
    seatLimit?: number;
    branding?: { accentColor?: unknown; logoUrl?: unknown; welcomeMessage?: unknown };
    reporting?: { channel?: unknown; instructions?: unknown };
    practiceVectors?: unknown;
  };

  const orgs = await organizationsCollection();
  const update: Record<string, unknown> = { updatedAt: new Date() };

  // Both fields used to be written as whatever arrived. A name of spaces renamed
  // the organisation to an empty string, which then showed as a blank in the
  // admin panel and on every invitation; and `Number(x) || 0` turned "abc" and
  // null into a seat limit of zero, which blocks every future invitation with
  // nothing to indicate why. Rejected now rather than coerced.
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return error(400, "Organization name can't be empty");
    }
    if (name.length > MAX_NAME_LENGTH) {
      return error(400, `Organization name can't be longer than ${MAX_NAME_LENGTH} characters`);
    }
    update.name = name;
  }

  if (body.ssoDomain !== undefined) {
    // Was stored exactly as typed, which is how three organisations ended up
    // with a full email address here and one with a leading "@". Harmless on
    // this field -- it is display only -- but it is the same box an admin then
    // types into the allowed-domain list that SSO actually matches on, so
    // accepting nonsense here teaches the wrong thing.
    const raw = body.ssoDomain.trim();
    if (!raw) {
      update.domain = null;
    } else {
      const parsed = parseDomainInput(raw);
      if (!parsed) {
        return error(400, "Enter an email domain on its own, like example.com.");
      }
      update.domain = parsed;
    }
  }

  if (body.seatLimit !== undefined) {
    // A fractional or negative limit is never what anyone meant, and one seat is
    // the floor because an organisation always contains at least its admin.
    const seatLimit = Number(body.seatLimit);
    if (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > MAX_SEAT_LIMIT) {
      return error(400, `Seat limit must be a whole number between 1 and ${MAX_SEAT_LIMIT}`);
    }
    update["settings.seatLimit"] = seatLimit;
  }

  // Workspace customisation. Written field by field with dotted paths so a
  // partial save cannot silently clear the settings it did not mention -- and
  // validated rather than coerced, because every one of these is rendered to
  // this organisation's employees. See src/server/orgBranding.ts for what each
  // field is actually exposed to.
  try {
    if (body.branding !== undefined) {
      const branding = body.branding ?? {};
      if ("accentColor" in branding) {
        update["settings.branding.accentColor"] = parseAccentColor(branding.accentColor);
      }
      if ("logoUrl" in branding) {
        update["settings.branding.logoUrl"] = parseHttpsUrl(branding.logoUrl, "Logo URL");
      }
      if ("welcomeMessage" in branding) {
        update["settings.branding.welcomeMessage"] = parsePlainText(
          branding.welcomeMessage,
          "Welcome message",
          MAX_WELCOME_MESSAGE,
        );
      }
    }
    if (body.reporting !== undefined) {
      const reporting = body.reporting ?? {};
      if ("channel" in reporting) {
        update["settings.reporting.channel"] = parseReportingChannel(reporting.channel);
      }
      if ("instructions" in reporting) {
        update["settings.reporting.instructions"] = parsePlainText(
          reporting.instructions,
          "Reporting instructions",
          MAX_REPORTING_INSTRUCTIONS,
        );
      }
    }
    if (body.practiceVectors !== undefined) {
      update["settings.practiceVectors"] = parsePracticeVectors(body.practiceVectors);
    }
  } catch (cause) {
    if (cause instanceof BrandingError) {
      return error(400, cause.message);
    }
    throw cause;
  }

  const org = await orgs.findOneAndUpdate(
    { _id: admin.orgId },
    { $set: update },
    { returnDocument: "after" },
  );

  // Same Org shape as GET /api/org, seats included: a settings save that came
  // back without them would make the client's cached org lose the counts.
  await recordAudit({
    orgId: admin.orgId,
    actorId: admin._id,
    action: "org.settings_updated",
    targetType: "organization",
    targetId: admin.orgId,
    // The keys that changed, not the values: a name is fine, but recording every
    // future setting's value here would eventually log something that should
    // not be in a log.
    metadata: { fields: Object.keys(update).filter((k) => k !== "updatedAt") },
    headers: req.headers,
  });

  return json(await toOrgDtoWithSeats(org!));
});
