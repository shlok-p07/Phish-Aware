import type { Request, Response, NextFunction } from "express";
import { getUserIdFromRequest } from "../lib/session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const userId = await getUserIdFromRequest(req);
  if (userId !== null) {
    req.userId = userId;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
