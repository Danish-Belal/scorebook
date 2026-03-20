import { db } from "../config/database";
import { errorLogs } from "../models/schema";
import { logger } from "../config/logger";

/** Turn any thrown value into JSON-safe details for `error_logs.details`. */
export function serializeError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export async function logError(
  source: string,
  message: string,
  details?: unknown,
  userId?: string
): Promise<void> {
  try {
    await db.insert(errorLogs).values({
      level: "error",
      source,
      message,
      details: details != null ? (details as object) : null,
      userId: userId ?? null,
    });
  } catch (e) {
    // Never let logging crash the app
    logger.error("Failed to write error log:", e);
  }
}

export async function logWarn(
  source: string,
  message: string,
  details?: unknown
): Promise<void> {
  try {
    await db.insert(errorLogs).values({
      level: "warn",
      source,
      message,
      details: details != null ? (details as object) : null,
    });
  } catch (e) {
    logger.error("Failed to write warn log:", e);
  }
}

export async function logInfo(
  source: string,
  message: string,
  details?: unknown,
  userId?: string
): Promise<void> {
  try {
    await db.insert(errorLogs).values({
      level: "info",
      source,
      message,
      details: details != null ? (details as object) : null,
      userId: userId ?? null,
    });
  } catch (e) {
    logger.error("Failed to write info log:", e);
  }
}