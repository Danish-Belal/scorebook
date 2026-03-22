import { Router, Request, Response, NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import passport from "../config/passport";
import { generateToken, requireAuth, AuthRequest } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { env } from "../config/env";
import { logError, serializeError } from "../services/errorLogger";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { users } from "../models/schema";
import { eq } from "drizzle-orm";
import { toPublicUser } from "../utils/publicUser";
import { queueFetchesAndScoreForUser } from "../services/userQueueBootstrap";

const router = Router();

const TOKEN_COOKIE = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function attachTokenCookie(res: Response, userId: string): void {
  res.cookie("token", generateToken(userId), TOKEN_COOKIE);
}

function setAuthCookieAndRedirect(res: Response, userId: string): void {
  attachTokenCookie(res, userId);
  void queueFetchesAndScoreForUser(userId);
  res.redirect(`${env.FRONTEND_URL}/dashboard`);
}

const registerSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  displayName: z.string().min(1, "Name is required").max(100).trim(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

// ─── Email + password ───────────────────────────────────────────────────────

router.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const { email, password, displayName } = req.body as z.infer<typeof registerSchema>;
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          displayName: displayName.trim(),
          passwordHash,
        })
        .returning();

      if (!newUser) {
        res.status(500).json({ error: "Could not create account" });
        return;
      }

      attachTokenCookie(res, newUser.id);
      void queueFetchesAndScoreForUser(newUser.id);
      res.status(201).json({
        success: true,
        user: toPublicUser(newUser),
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }
      void logError("auth/register", "Registration failed", serializeError(err));
      res.status(500).json({ error: "Could not create account" });
    }
  }
);

router.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!user?.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      await db
        .update(users)
        .set({ lastActive: new Date() })
        .where(eq(users.id, user.id));

      attachTokenCookie(res, user.id);
      void queueFetchesAndScoreForUser(user.id);
      res.json({ success: true, user: toPublicUser(user) });
    } catch (err) {
      void logError("auth/login", "Login failed", serializeError(err));
      res.status(500).json({ error: "Sign-in failed" });
    }
  }
);

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

router.get(
  "/github",
  authLimiter,
  passport.authenticate("github", { scope: ["user:email", "read:user"] })
);

router.get(
  "/github/callback",
  (req: Request, res: Response, next: NextFunction) => {
    // GitHub redirects here with ?error=... when user denies or app misconfigured
    const qErr = req.query.error;
    if (typeof qErr === "string") {
      const desc = req.query.error_description;
      const msg = typeof desc === "string" ? `${qErr}: ${desc}` : qErr;
      logger.warn(`[auth/github] Callback query error — ${msg}`);
      void logError("auth/github", `GitHub OAuth callback query: ${qErr}`, {
        error_description: typeof desc === "string" ? desc : undefined,
      });
      return res.redirect(`${env.FRONTEND_URL}/auth/error`);
    }

    passport.authenticate(
      "github",
      { session: false },
      (err: Error | undefined, user: Express.User | false, info: object | string | Array<string> | undefined) => {
        if (err) {
          logger.warn(`[auth/github] Passport error — ${err.message}`);
          void logError("auth/github", err.message || "GitHub OAuth error", {
            ...serializeError(err),
            info,
          });
          return res.redirect(`${env.FRONTEND_URL}/auth/error`);
        }
        if (!user || typeof user !== "object" || !("id" in user)) {
          logger.warn("[auth/github] Passport returned no user");
          void logError("auth/github", "OAuth failed: no user returned", {
            info: info != null ? String(info) : undefined,
          });
          return res.redirect(`${env.FRONTEND_URL}/auth/error`);
        }
        try {
          const uid = (user as { id: string }).id;
          logger.info(`[auth/github] Sign-in OK → userId=${uid}`);
          setAuthCookieAndRedirect(res, uid);
        } catch (e) {
          void logError("auth/github", "Token or redirect failed after OAuth", serializeError(e), (user as { id: string }).id);
          return res.redirect(`${env.FRONTEND_URL}/auth/error`);
        }
      }
    )(req, res, next);
  }
);

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.get(
  "/google",
  authLimiter,
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      "google",
      { session: false },
      (err: Error | undefined, user: Express.User | false, info: object | string | Array<string> | undefined) => {
        if (err) {
          void logError("auth/google", err.message || "Google OAuth error", {
            ...serializeError(err),
            info,
          });
          return res.redirect(`${env.FRONTEND_URL}/auth/error`);
        }
        if (!user || typeof user !== "object" || !("id" in user)) {
          void logError("auth/google", "OAuth failed: no user returned", {
            info: info != null ? String(info) : undefined,
          });
          return res.redirect(`${env.FRONTEND_URL}/auth/error`);
        }
        try {
          setAuthCookieAndRedirect(res, (user as { id: string }).id);
        } catch (e) {
          void logError("auth/google", "Token or redirect failed after OAuth", serializeError(e), (user as { id: string }).id);
          return res.redirect(`${env.FRONTEND_URL}/auth/error`);
        }
      }
    )(req, res, next);
  }
);

// ─── Current user ─────────────────────────────────────────────────────────────

router.get("/me", requireAuth as RequestHandler, ((req: Request, res: Response) => {
  res.json({ user: (req as AuthRequest).user });
}) as RequestHandler);

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ success: true });
});

export default router;
