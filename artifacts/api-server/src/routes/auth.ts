import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignupBody, LoginBody, GetCurrentUserResponse, SignupResponse, LoginResponse, ContinueAsGuestResponse } from "@workspace/api-zod";
import { hashPassword, verifyPassword } from "../lib/password";
import { createSession, destroySession } from "../lib/session";
import { requireAuth } from "../middlewares/auth";
import { toUserDto } from "../lib/dto";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(GetCurrentUserResponse.parse(toUserDto(user)));
});

router.post("/auth/signup", async (req, res) => {
  const body = SignupBody.parse(req.body);
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  const [user] = await db
    .insert(usersTable)
    .values({
      name: body.name,
      email: body.email,
      passwordHash: hashPassword(body.password),
      isGuest: false,
    })
    .returning();
  await createSession(res, user!.id);
  res.status(201).json(SignupResponse.parse(toUserDto(user!)));
});

router.post("/auth/login", async (req, res) => {
  const body = LoginBody.parse(req.body);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (!user || !user.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  await createSession(res, user.id);
  res.json(LoginResponse.parse(toUserDto(user)));
});

router.post("/auth/guest", async (_req, res) => {
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "Guest",
      isGuest: true,
    })
    .returning();
  await createSession(res, user!.id);
  res.status(201).json(ContinueAsGuestResponse.parse(toUserDto(user!)));
});

router.post("/auth/logout", async (req, res) => {
  await destroySession(req, res);
  res.status(204).send();
});

export default router;
