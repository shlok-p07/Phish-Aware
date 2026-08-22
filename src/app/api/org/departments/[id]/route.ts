import { NextRequest } from "next/server";
import { departmentsCollection, usersCollection, toObjectId } from "@/db";
import {
  MAX_DEPARTMENT_NAME_LENGTH,
  findOrgDepartment,
  normalizeDepartmentName,
} from "@/server/departments";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { recordAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

/** Rename a department, carrying its members with it. */
export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const departmentId = toObjectId(id);
    if (!departmentId) {
      return error(400, "Invalid department id");
    }
    const body = (await readJsonBody(req)) as { name?: string };
    const name = normalizeDepartmentName(body.name ?? "");
    if (!name) {
      return error(400, "Department name is required");
    }
    if (name.length > MAX_DEPARTMENT_NAME_LENGTH) {
      return error(
        400,
        `Department name can't be longer than ${MAX_DEPARTMENT_NAME_LENGTH} characters`,
      );
    }

    const departments = await departmentsCollection();
    const current = await departments.findOne({ _id: departmentId, orgId: admin.orgId });
    if (!current) {
      return error(404, "Department not found");
    }

    // Captured before the update. Reading it afterwards happens to work against
    // a real driver, which decodes a fresh copy, but it makes the members query
    // below depend on that -- and the rename would silently move nobody if it
    // ever stopped being true.
    const previousName = current.name;

    const clash = await findOrgDepartment(admin.orgId, name);
    if (clash && !clash._id.equals(departmentId)) {
      return error(409, "That department already exists");
    }

    await departments.updateOne(
      { _id: departmentId, orgId: admin.orgId },
      { $set: { name, updatedAt: new Date() } },
    );

    // The name is denormalized onto every member for the sake of the practice
    // path, so a rename has to carry them across or they would point at a
    // department that no longer exists under that name.
    const users = await usersCollection();
    await users.updateMany(
      { orgId: admin.orgId, department: previousName },
      { $set: { department: name, departmentId, updatedAt: new Date() } },
    );

    await recordAudit({
      orgId: admin.orgId,
      actorId: admin._id,
      action: "department.renamed",
      targetType: "department",
      targetId: departmentId,
      metadata: { from: previousName, to: name },
      headers: req.headers,
    });

    return json({ id: departmentId.toString(), name });
  },
);

/** Delete a department. Members keep their accounts and become unassigned. */
export const DELETE = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const departmentId = toObjectId(id);
    if (!departmentId) {
      return error(400, "Invalid department id");
    }

    const departments = await departmentsCollection();
    const current = await departments.findOne({ _id: departmentId, orgId: admin.orgId });
    if (!current) {
      return error(404, "Department not found");
    }

    // Unassigned rather than deleted: removing a department is an org-structure
    // change, not a reason to lose people or their history. They show up under
    // "No department" until an admin files them somewhere else.
    // Unassign before the row goes, and off a captured name, for the same reason
    // the rename does: the members query must not depend on what the department
    // document still says after it has been touched.
    const removedName = current.name;
    const users = await usersCollection();
    await users.updateMany(
      { orgId: admin.orgId, department: removedName },
      { $set: { department: null, departmentId: null, updatedAt: new Date() } },
    );
    await departments.deleteOne({ _id: departmentId, orgId: admin.orgId });

    await recordAudit({
      orgId: admin.orgId,
      actorId: admin._id,
      action: "department.deleted",
      targetType: "department",
      targetId: departmentId,
      metadata: { name: removedName },
      headers: _req.headers,
    });

    return new Response(null, { status: 204 });
  },
);
