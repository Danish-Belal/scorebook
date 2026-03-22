-- Public profile short URL: /u/:profile_slug (optional; UUID still works)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_slug" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_profile_slug_idx" ON "users" ("profile_slug");
