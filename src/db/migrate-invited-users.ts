/**
 * One-off migration: convert the old dead "invited" user rows into real
 * invitations.
 *
 * Before the invitation flow existed, POST /api/org/members inserted a users
 * row with passwordHash:null and status:"invited". Those accounts can never be
 * signed in to (login rejects a null hash) and block signup on the duplicate
 * email, so they're pure dead weight -- and they'd shadow the new invitation
 * rows in the merged members list.
 *
 * Deliberately NOT wired into provisionDatabase(): it deletes user documents,
 * which must be an explicit act. Run it by hand:
 *
 *   bun run db:migrate-invites            (dry run -- prints what it would do)
 *   bun run db:migrate-invites -- --apply
 */
import { ObjectId } from "mongodb";
import {
  usersCollection,
  invitationsCollection,
  organizationsCollection,
  specDefaults,
  closeMongoClient,
  type InvitationDoc,
} from "@/db";
import { generateInviteToken, invitationExpiry } from "@/server/invitations";

async function main() {
  const apply = process.argv.includes("--apply");
  const [users, invitations, orgs] = await Promise.all([
    usersCollection(),
    invitationsCollection(),
    organizationsCollection(),
  ]);

  const dead = await users
    .find({ status: "invited", passwordHash: null, orgId: { $ne: null } })
    .toArray();

  if (dead.length === 0) {
    console.log("No legacy invited-user rows found. Nothing to do.");
    return;
  }

  console.log(`Found ${dead.length} legacy invited-user row(s).\n`);
  let converted = 0;
  let skipped = 0;

  for (const user of dead) {
    const orgId = user.orgId!;
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      console.log(`  SKIP   ${user._id.toString()}: no email on the row`);
      skipped += 1;
      continue;
    }

    const org = await orgs.findOne({ _id: orgId }, { projection: { name: 1 } });
    const label = `${email} -> ${org?.name ?? orgId.toString()}`;

    const alreadyInvited = await invitations.findOne({ orgId, email, status: "pending" });
    if (alreadyInvited) {
      console.log(`  SKIP   ${label}: a pending invitation already exists`);
      skipped += 1;
      continue;
    }

    if (!apply) {
      console.log(`  WOULD  ${label}: create invitation, delete user row`);
      converted += 1;
      continue;
    }

    const now = new Date();
    const id = new ObjectId();
    const invitation: InvitationDoc = {
      _id: id,
      invitationId: id,
      orgId,
      email,
      name: user.name || null,
      role: user.role,
      departmentId: null,
      department: user.department,
      token: generateInviteToken(),
      status: "pending",
      // The original inviter isn't recorded on the old rows; attribute it to
      // the row itself so the required field stays populated and traceable.
      invitedBy: user._id,
      expiresAt: invitationExpiry(now),
      acceptedAt: null,
      acceptedUserId: null,
      ...specDefaults(now),
    };
    await invitations.insertOne(invitation);
    await users.deleteOne({ _id: user._id });
    console.log(`  DONE   ${label}`);
    converted += 1;
  }

  console.log(
    `\n${apply ? "Converted" : "Would convert"} ${converted}, skipped ${skipped}.` +
      (apply ? "" : "\nRe-run with --apply to make these changes."),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
