import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logError, serializeError } from "../services/errorLogger";
import { env } from "../config/env";
import { db } from "../config/database";
import { users } from "../models/schema";
import { eq } from "drizzle-orm";
import { toPublicUser } from "../utils/publicUser";

export interface AuthRequest extends Request {
  user?: Express.User;
}

export function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : req.cookies?.token;

    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = toPublicUser(user);
    next();
  } catch (e) {
    if (!(e instanceof jwt.JsonWebTokenError) && !(e instanceof jwt.TokenExpiredError)) {
      void logError("auth/middleware", "requireAuth failed", serializeError(e));
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies?.token;

  if (!token) return next();

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    (req as any)._userId = payload.sub;
  } catch {
    // ignore
  }
  next();
}
