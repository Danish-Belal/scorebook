export {};

declare global {
  namespace Express {
    /** Authenticated user (no password hash) — email/password or OAuth */
    interface User {
      id: string;
      email: string | null;
      displayName: string;
      avatarUrl: string | null;
      githubLogin: string | null;
      createdAt: Date | null;
      isPublic: boolean | null;
      profileSlug: string | null;
    }
  }
}
