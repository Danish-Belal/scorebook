import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";

import { env } from "./config/env";
import { checkDatabaseConnection } from "./config/database";
import { checkRedisConnection } from "./config/redis";
import "./config/passport";

import { apiLimiter } from "./middleware/rateLimit";

import authRoutes      from "./routes/auth";
import userRoutes      from "./routes/users";
import platformRoutes  from "./routes/platforms";
import scoreRoutes     from "./routes/scores";

import { logger } from "./config/logger";
import { logError, serializeError } from "./services/errorLogger";
import type { AuthRequest } from "./middleware/auth";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", apiLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "scorebook-backend", version: "2.0.0", env: env.NODE_ENV });
});

app.use("/auth",           authRoutes);
app.use("/api/users",      userRoutes);
app.use("/api/platforms",  platformRoutes);
app.use("/api/scores",     scoreRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const userId = (req as AuthRequest).user?.id;
  void logError(
    "api",
    err.message || "Unhandled error",
    { ...serializeError(err), path: req.path, method: req.method },
    userId
  );
  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    await checkDatabaseConnection();
    await checkRedisConnection();
    app.listen(env.PORT, () => {
      logger.info(`🚀 ScoreBook v2 API → http://localhost:${env.PORT}`);
      logger.info(`   Platforms supported: Codeforces, LeetCode, CodeChef, AtCoder, HackerRank, HackerEarth, TopCoder, GFG, GitHub`);
      logger.info(`   OAuth — register these URLs exactly (Google Cloud + GitHub OAuth App):`);
      logger.info(`     Google redirect: ${env.OAUTH_CALLBACK_BASE_URL}/auth/google/callback`);
      logger.info(`     GitHub callback: ${env.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`);
      logger.info(`   CORS origin (must match browser): ${env.FRONTEND_URL}`);
      logger.info(`   Frontend OAuth links use NEXT_PUBLIC_API_URL → must be this API base (e.g. http://localhost:${env.PORT})`);
      if (
        env.GITHUB_CLIENT_ID === "your_github_client_id" ||
        env.GITHUB_CLIENT_SECRET === "your_github_client_secret"
      ) {
        logger.warn(
          "⚠️  GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are still .env.example placeholders — GitHub OAuth URLs will use client_id=your_github_client_id and fail. Copy Client ID + Secret from GitHub → Settings → Developer settings → OAuth Apps → your app, then restart the API."
        );
      }
    });
  } catch (err: any) {
    logger.error("Startup failed:", err.message);
    process.exit(1);
  }
}

start();
