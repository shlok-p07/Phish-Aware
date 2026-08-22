import { describe, expect, it } from "bun:test";
import {
  describeTrainingTarget,
  encodeDepartmentTarget,
  parseTrainingTarget,
} from "@/lib/trainingTarget";
import { DEPARTMENTS } from "@/lib/onboarding-survey";

const noMembers = () => null;

describe("parseTrainingTarget", () => {
  it("reads the whole-org target", () => {
    expect(parseTrainingTarget("all")).toEqual({ kind: "all" });
  });

  it("round-trips every department the survey offers", () => {
    for (const d of DEPARTMENTS) {
      expect(parseTrainingTarget(encodeDepartmentTarget(d))).toEqual({
        kind: "department",
        department: d,
      });
    }
  });

  it("decodes a department this module has never heard of", () => {
    // Departments are organization-owned records now, so a name outside the
    // shipped ten is perfectly legitimate. Whether it exists is a question about
    // one org's records, which this module cannot answer -- the route checks it.
    expect(parseTrainingTarget("department:Claims Processing")).toEqual({
      kind: "department",
      department: "Claims Processing",
    });
  });

  it("rejects an empty department", () => {
    expect(parseTrainingTarget("department:")).toBeNull();
  });

  it("treats anything else as a member id", () => {
    expect(parseTrainingTarget("507f1f77bcf86cd799439011")).toEqual({
      kind: "member",
      memberId: "507f1f77bcf86cd799439011",
    });
  });

  it("rejects an empty target rather than calling it a member", () => {
    expect(parseTrainingTarget("")).toBeNull();
  });

  it("does not mistake a department name for a member id", () => {
    // A department containing the prefix as a substring must not slip through
    // as a member id, which would send the campaign to nobody.
    expect(parseTrainingTarget("Finance")).toEqual({ kind: "member", memberId: "Finance" });
    expect(parseTrainingTarget("department:Finance")).toEqual({
      kind: "department",
      department: "Finance",
    });
  });
});

describe("describeTrainingTarget", () => {
  it("names the whole org", () => {
    expect(describeTrainingTarget("all", noMembers)).toBe("Everyone");
  });

  it("names a department", () => {
    expect(describeTrainingTarget("department:Finance", noMembers)).toBe("Finance department");
  });

  it("resolves a member", () => {
    expect(describeTrainingTarget("abc", () => "Dana")).toBe("Dana");
  });

  it("still renders when the member is gone", () => {
    expect(describeTrainingTarget("abc", noMembers)).toBe("Unknown");
  });

  it("renders a department name it does not recognise", () => {
    expect(describeTrainingTarget("department:Claims Processing", noMembers)).toBe(
      "Claims Processing department",
    );
  });

  it("still refuses an empty department name", () => {
    expect(describeTrainingTarget("department:", noMembers)).toBe("Unknown");
  });
});
