import { Router, Response, Request } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { db } from "../config/database";
import { users, platformProfiles, scores } from "../models/schema";
import { eq } from "drizzle-orm";
import { toPublicUser } from "../utils/publicUser";
import { resolveProfileUser, normalizeProfileSlug, isValidProfileSlug } from "../services/profileKey";
import { logError, serializeError } from "../services/errorLogger";

const router = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio:         z.string().max(500).optional(),
  isPublic:    z.boolean().optional(),
  profileSlug: z.union([z.string().max(40), z.null()]).optional(),
});

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

// GET /users/me — full profile + platforms + score summary
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [profiles, scoreRow] = await Promise.all([
    db.select().from(platformProfiles).where(eq(platformProfiles.userId, userId)),
    db.select().from(scores).where(eq(scores.userId, userId)).limit(1),
  ]);

  res.json({
    user:           req.user,
    platforms:      profiles,
    scoreSnapshot:  scoreRow[0] ?? null,
  });
});

// PATCH /users/me — update profile
router.patch(
  "/me",
  requireAuth,
  validateBody(updateProfileSchema),
  async (req: AuthRequest, res: Response) => {
    const body = req.body as z.infer<typeof updateProfileSchema>;
    const patch: Partial<{
      displayName: string;
      bio: string | null;
      isPublic: boolean;
      profileSlug: string | null;
    }> = {};

    if (body.displayName !== undefined) {
      patch.displayName = body.displayName.trim();
    }
    if (body.bio !== undefined) {
      patch.bio = body.bio.trim() || null;
    }
    if (body.isPublic !== undefined) {
      patch.isPublic = body.isPublic;
    }
    if (body.profileSlug !== undefined) {
      if (body.profileSlug === null || body.profileSlug === "") {
        patch.profileSlug = null;
      } else {
        const norm = normalizeProfileSlug(body.profileSlug);
        if (!isValidProfileSlug(norm)) {
          res.status(400).json({
            error:
              "Invalid profile slug. Use 3–32 characters: lowercase letters, numbers, and hyphens (not reserved words).",
          });
          return;
        }
        patch.profileSlug = norm;
      }
    }

    if (Object.keys(patch).length === 0) {
      const [row] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
      res.json({ user: row ? toPublicUser(row) : req.user });
      return;
    }

    try {
      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, req.user!.id))
        .returning();
      res.json({ user: toPublicUser(updated) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "That profile URL is already taken. Try another slug." });
        return;
      }
      void logError("users/patch-me", "Profile update failed", serializeError(err));
      res.status(500).json({ error: "Could not update profile" });
    }
  }
);

// GET /users/:id — public profile (UUID or profile_slug)
router.get("/:id", async (req: Request, res: Response) => {
  const user = await resolveProfileUser(req.params.id);
  if (!user || user.isPublic === false) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [profiles, scoreRow] = await Promise.all([
    db.select().from(platformProfiles).where(eq(platformProfiles.userId, user.id)),
    db.select().from(scores).where(eq(scores.userId, user.id)).limit(1),
  ]);

  res.json({
    user: {
      id:          user.id,
      displayName: user.displayName,
      avatarUrl:   user.avatarUrl,
      githubLogin: user.githubLogin,
      profileSlug: user.profileSlug ?? null,
      createdAt:   user.createdAt,
    },
    platforms:     profiles.map((p) => ({ platform: p.platform, username: p.username })),
    scoreSnapshot: scoreRow[0]
      ? {
          compositeScore: parseFloat(scoreRow[0].compositeScore),
          computedAt:     scoreRow[0].computedAt,
        }
      : null,
  });
});

export default router;
