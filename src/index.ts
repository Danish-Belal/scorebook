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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
    });
  } catch (err: any) {
    logger.error("Startup failed:", err.message);
    process.exit(1);
  }
}

start();
