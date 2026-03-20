import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./database";
import { users } from "../models/schema";
import { eq } from "drizzle-orm";
import { env } from "./env";
import { logError, logWarn, serializeError } from "../services/errorLogger";

/** Passport OAuth verify `done` callback */
type OAuthDone = (err: Error | null, user?: false | object, info?: unknown) => void;

passport.use(
  new GitHubStrategy(
    {
      clientID: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      callbackURL: `${env.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`,
      scope: ["user:email", "read:user"],
    },
    async (_accessToken: string, _refreshToken: string, profile: any, done: OAuthDone) => {
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
        void logError("auth/passport-github", "Strategy verify failed", serializeError(err));
        return done(err as Error);
      }
    }
  )
);

// @types/passport-google-oauth20 overloads disagree with standard OAuth verify arity; constructor is correct at runtime.
const GoogleStrategyCtor = GoogleStrategy as unknown as new (
  options: { clientID: string; clientSecret: string; callbackURL: string },
  verify: (
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: OAuthDone
  ) => void | Promise<void>
) => passport.Strategy;

passport.use(
  new GoogleStrategyCtor(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${env.OAUTH_CALLBACK_BASE_URL}/auth/google/callback`,
    },
    async (_accessToken: string, _refreshToken: string, profile: any, done: OAuthDone) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          void logWarn("auth/passport-google", "No email on Google profile", {
            googleId: profile.id,
          });
          return done(new Error("No email from Google profile"));
        }

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
        void logError("auth/passport-google", "Strategy verify failed", serializeError(err));
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
    void logError("auth/passport-deserialize", "deserializeUser failed", {
      ...serializeError(err),
      userId: id,
    });
    done(err as Error);
  }
});

export default passport;
