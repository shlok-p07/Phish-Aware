import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { departmentsCollection, usersCollection, specDefaults } from "@/db";
import {
  MAX_DEPARTMENT_NAME_LENGTH,
  findOrgDepartment,
  listOrgDepartments,
  normalizeDepartmentName,
} from "@/server/departments";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { recordAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

/** Departments belonging to the caller's organization, with a headcount each. */
export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const departments = await listOrgDepartments(admin.orgId);
  const users = await usersCollection();
  const members = await users.find({ orgId: admin.orgId }).toArray();

  return json(
    departments.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      memberCount: members.filter((m) => m.department === d.name).length,
    })),
  );
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await readJsonBody(req)) as { name?: string };

  const name = normalizeDepartmentName(body.name ?? "");
  if (!name) {
    return error(400, "Department name is required");
  }
  if (name.length > MAX_DEPARTMENT_NAME_LENGTH) {
    return error(400, `Department name can't be longer than ${MAX_DEPARTMENT_NAME_LENGTH} characters`);
  }
  // Case-insensitive, so "finance" cannot be added alongside "Finance" and leave
  // two departments that read as one.
  if (await findOrgDepartment(admin.orgId, name)) {
    return error(409, "That department already exists");
  }

  const id = new ObjectId();
  await (await departmentsCollection()).insertOne({
    _id: id,
    departmentId: id,
    orgId: admin.orgId,
    name,
    parentId: null,
    managerId: null,
    ...specDefaults(),
  });

  await recordAudit({
    orgId: admin.orgId,
    actorId: admin._id,
    action: "department.created",
    targetType: "department",
    targetId: id,
    metadata: { name },
    headers: req.headers,
  });

  return json({ id: id.toString(), name, memberCount: 0 }, { status: 201 });
});
