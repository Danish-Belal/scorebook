import winston from "winston";
import { env } from "./env";

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    // Stack traces only in non-production server logs
    winston.format.errors({ stack: env.NODE_ENV !== "production" }),
    env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ timestamp, level, message, ...meta }) =>
              `${timestamp} [${level}]: ${message}${
                Object.keys(meta).length ? " " + JSON.stringify(meta) : ""
              }`
          )
        )
  ),
  transports: [new winston.transports.Console()],
});
