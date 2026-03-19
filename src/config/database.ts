import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "./env";
import * as schema from "../models/schema";

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });

export async function checkDatabaseConnection(): Promise<void> {
  await sql`SELECT 1`;
  console.log("✅ Neon PostgreSQL connected");
}
