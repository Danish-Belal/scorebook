import { db } from "../config/database";
import { errorLogs } from "../models/schema";
import { logger } from "../config/logger";
import { env } from "../config/env";

/** Turn any thrown value into JSON-safe details for `error_logs.details`. */
export function serializeError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    const base = { name: err.name, message: err.message };
    // Never persist stack traces in production DB (paths, internals)
    if (env.NODE_ENV === "production") {
      return base;
    }
    return { ...base, stack: err.stack };
  }
  return { message: String(err) };
}

/** Remove stack traces from nested objects before persisting (defense in depth). */
function redactDetailsForStorage(details: unknown): unknown {
  if (env.NODE_ENV !== "production") return details;
  if (details == null || typeof details !== "object") return details;
  try {
    const clone = JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
    const strip = (o: Record<string, unknown>) => {
      delete o.stack;
      for (const v of Object.values(o)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          strip(v as Record<string, unknown>);
        }
      }
    };
    strip(clone);
    return clone;
  } catch {
    return { message: "redacted" };
  }
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
      details: details != null ? (redactDetailsForStorage(details) as object) : null,
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
      details: details != null ? (redactDetailsForStorage(details) as object) : null,
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
      details: details != null ? (redactDetailsForStorage(details) as object) : null,
      userId: userId ?? null,
    });
  } catch (e) {
    logger.error("Failed to write info log:", e);
  }
}