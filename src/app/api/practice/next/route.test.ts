import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";
import { installModuleMock } from "@/test/mock-module-registry";
import {
  installScenarioGeneratorMock,
  resetFakeGeneratorState,
} from "@/test/mock-scenario-generator";

await installMongoMock();
await installSessionMock();

// The route tops the pool up in the background and, when a pool is dry, blocks
// on live generation. Neither belongs in a unit test of which scenarios the
// route is willing to read, and both would make real network calls.
installModuleMock("@/server/scenarioPool", "practice/next/route.test", () => ({
  topUpPoolInBackground: () => {},
}));
await installScenarioGeneratorMock();

const { GET } = await import("./route");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();
const ME = new ObjectId();

function seedMe(orgId: ObjectId | null) {
  fakeDbState.users.push({
    _id: ME,
    orgId,
    name: "Sam",
    department: "Finance",
    workType: "Hybrid",
    phishingAwarenessScore: 0.5,
  });
  fakeSessionState.userId = ME;
}

function seedScenario(label: string, orgId: ObjectId | null, vector = "email") {
  const id = new ObjectId();
  fakeDbState.scenarios.push({
    _id: id,
    scenarioId: id,
    orgId,
    vector,
    isOnboarding: false,
    isPhish: true,
    difficulty: 3,
    sender: `${label} <a@b.test>`,
    subject: label,
    body: label,
    links: [],
    attachments: [],
    cues: [],
    source: "ai_generated",
  });
  return label;
}

async function served(vector = "email") {
  const res = await GET(
    new NextRequest(`http://localhost/api/practice/next?vector=${vector}`),
  );
  return res;
}

describe("GET /api/practice/next scenario ownership", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    // Shared, process-global fake: state has to be set to what this file needs
    // rather than inherited from whichever file ran last. Generation returns
    // nothing here, so a dry pool is a 404 instead of a live provider call.
    resetFakeGeneratorState();
  });

  it("serves the shared library to a member of an org", async () => {
    seedMe(ORG);
    seedScenario("shared", null);

    const res = await served();

    expect(res.status).toBe(200);
    expect((await res.json()).subject).toBe("shared");
  });

  it("serves the org's own generated content", async () => {
    seedMe(ORG);
    seedScenario("ours", ORG);

    const res = await served();

    expect(res.status).toBe(200);
    expect((await res.json()).subject).toBe("ours");
  });

  it("never serves content generated for another org", async () => {
    seedMe(ORG);
    seedScenario("theirs", OTHER_ORG);

    const res = await served();

    // Nothing readable is left, and generation is stubbed out, so the honest
    // answer is 404 rather than another customer's scenario.
    expect(res.status).toBe(404);
  });

  it("picks from the union of the shared library and the org's own", async () => {
    seedMe(ORG);
    seedScenario("shared", null);
    seedScenario("ours", ORG);
    seedScenario("theirs", OTHER_ORG);

    const res = await served();

    expect(res.status).toBe(200);
    expect(["shared", "ours"]).toContain((await res.json()).subject);
  });

  it("gives a self-signup user the shared library only", async () => {
    seedMe(null);
    seedScenario("shared", null);
    seedScenario("someone else's org", ORG);

    const res = await served();

    expect(res.status).toBe(200);
    expect((await res.json()).subject).toBe("shared");
  });

  it("honors the requested vector rather than randomising it", async () => {
    seedMe(ORG);
    seedScenario("a text", null, "sms");
    seedScenario("an email", null, "email");

    const res = await served("sms");

    // ?vector=qr used to fall through an || chain to undefined, which randomised
    // the round; the same trap applied to every vector added after voice.
    expect(res.status).toBe(200);
    expect((await res.json()).vector).toBe("sms");
  });

  it("honors a vector the old parser did not know about", async () => {
    seedMe(ORG);
    seedScenario("a notice", null, "qr");
    seedScenario("an email", null, "email");

    const res = await served("qr");

    expect(res.status).toBe(200);
    expect((await res.json()).vector).toBe("qr");
  });

  it("refuses an unauthenticated request", async () => {
    seedScenario("shared", null);
    fakeSessionState.userId = null;

    const res = await served();

    expect(res.status).toBe(401);
  });
});

describe("GET /api/practice/next channel restrictions", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    resetFakeGeneratorState();
  });

  function seedOrg(practiceVectors: string[]) {
    fakeDbState.organizations.push({
      _id: ORG,
      orgId: ORG,
      name: "Acme Ltd",
      domain: null,
      settings: { seatLimit: 50, practiceVectors },
    });
  }

  it("ignores a channel the organisation does not train on", async () => {
    // The vector arrives as a query parameter, so hiding the tab in the UI is
    // not a restriction. A member could otherwise ask for it directly.
    seedMe(ORG);
    seedOrg(["email"]);
    seedScenario("allowed", ORG, "email");
    seedScenario("blocked", ORG, "voice");

    const body = await (await served("voice")).json();
    expect(body.vector).toBe("email");
  });

  it("honours a channel the organisation does train on", async () => {
    seedMe(ORG);
    seedOrg(["email", "sms"]);
    seedScenario("sms one", ORG, "sms");

    const body = await (await served("sms")).json();
    expect(body.vector).toBe("sms");
  });

  it("draws only from the allowed channels when nothing was asked for", async () => {
    seedMe(ORG);
    seedOrg(["sms"]);
    seedScenario("sms one", ORG, "sms");

    const res = await GET(new NextRequest("http://localhost/api/practice/next"));
    expect((await res.json()).vector).toBe("sms");
  });

  it("places no restriction when the organisation has set none", async () => {
    seedMe(ORG);
    seedOrg([]);
    seedScenario("voice one", ORG, "voice");

    const body = await (await served("voice")).json();
    expect(body.vector).toBe("voice");
  });

  it("places no restriction on a learner with no organisation", async () => {
    seedMe(null);
    seedScenario("voice one", null, "voice");

    const body = await (await served("voice")).json();
    expect(body.vector).toBe("voice");
  });
});
