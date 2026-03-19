import { Router, Request, Response } from "express";
import passport from "../config/passport";
import { generateToken, requireAuth, AuthRequest } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { env } from "../config/env";

const router = Router();

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

router.get(
  "/github",
  authLimiter,
  passport.authenticate("github", { scope: ["user:email", "read:user"] })
);

router.get(
  "/github/callback",
  passport.authenticate("github", { session: false, failureRedirect: `${env.FRONTEND_URL}/auth/error` }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    const token = generateToken(user.id);
    // Set as httpOnly cookie + redirect to dashboard
    res.cookie("token", token, {
      httpOnly: true,
      secure:   env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
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
  passport.authenticate("google", { session: false, failureRedirect: `${env.FRONTEND_URL}/auth/error` }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    const token = generateToken(user.id);
    res.cookie("token", token, {
      httpOnly: true,
      secure:   env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  }
);

// ─── Current user ─────────────────────────────────────────────────────────────

router.get("/me", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ success: true });
});

export default router;
