import type { User } from "../models/schema";

/** Safe user object for JSON / JWT contexts (no password hash). */
export function toPublicUser(user: User): Express.User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    githubLogin: user.githubLogin,
    createdAt: user.createdAt,
    isPublic: user.isPublic,
    profileSlug: user.profileSlug ?? null,
  };
}
