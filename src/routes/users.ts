import { Router, Response, Request } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { db } from "../config/database";
import { users, platformProfiles, scores } from "../models/schema";
import { eq } from "drizzle-orm";
import { toPublicUser } from "../utils/publicUser";

const router = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio:         z.string().max(500).optional(),
  isPublic:    z.boolean().optional(),
});

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
    const [updated] = await db
      .update(users)
      .set(req.body)
      .where(eq(users.id, req.user!.id))
      .returning();
    res.json({ user: toPublicUser(updated) });
  }
);

// GET /users/:id — public profile
router.get("/:id", async (req: Request, res: Response) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.params.id))
    .limit(1);

  if (!user || !user.isPublic) {
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
