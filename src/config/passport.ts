import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./database";
import { users } from "../models/schema";
import { eq } from "drizzle-orm";
import { env } from "./env";

passport.use(
  new GitHubStrategy(
    {
      clientID: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      callbackURL: `${env.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`,
      scope: ["user:email", "read:user"],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email =
          profile.emails?.[0]?.value ?? `${profile.username}@github.noemail`;
        const avatarUrl = profile.photos?.[0]?.value ?? null;
        const displayName = profile.displayName || profile.username || "Developer";

        // Upsert: find by githubLogin or email, create if not found
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.githubLogin, profile.username!))
          .limit(1);

        if (existing.length > 0) {
          // Update last active & avatar
          const [updated] = await db
            .update(users)
            .set({ lastActive: new Date(), avatarUrl })
            .where(eq(users.id, existing[0].id))
            .returning();
          return done(null, updated);
        }

        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({ email, displayName, avatarUrl, githubLogin: profile.username })
          .onConflictDoUpdate({
            target: users.email,
            set: { githubLogin: profile.username, avatarUrl, lastActive: new Date() },
          })
          .returning();

        return done(null, newUser);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${env.OAUTH_CALLBACK_BASE_URL}/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email from Google profile"));

        const avatarUrl = profile.photos?.[0]?.value ?? null;
        const displayName = profile.displayName || "Developer";

        const [user] = await db
          .insert(users)
          .values({ email, displayName, avatarUrl, googleId: profile.id })
          .onConflictDoUpdate({
            target: users.email,
            set: { googleId: profile.id, avatarUrl, lastActive: new Date() },
          })
          .returning();

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

passport.serializeUser((user: any, done) => done(null, user.id));

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    done(null, user ?? null);
  } catch (err) {
    done(err);
  }
});

export default passport;
