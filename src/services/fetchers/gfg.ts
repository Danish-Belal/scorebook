import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../../config/logger";

export interface GFGData {
  username: string;
  practiceScore: number;
  problemsSolved: number;
  monthlyCodingScore: number;
  codingStreak: number;
  rank: number; // GFG institute rank (if available)
  fetchedAt: string;
}

export async function fetchGFGData(username: string): Promise<GFGData> {
  logger.debug(`[GFG] Fetching data for ${username}`);

  // GFG has a semi-public API for user stats
  const apiUrl = `https://geeks-for-geeks-api.vercel.app/${username}`;

  try {
    const res = await axios.get(apiUrl, { timeout: 10000 });
    const data = res.data;

    if (data.error) throw new Error(data.error);

    const result: GFGData = {
      username,
      practiceScore: data.info?.codingScore ?? 0,
      problemsSolved: data.info?.totalProblemsSolved ?? 0,
      monthlyCodingScore: data.info?.monthlyCodingScore ?? 0,
      codingStreak: data.info?.streak?.currentStreak ?? 0,
      rank: 0,
      fetchedAt: new Date().toISOString(),
    };

    logger.info(
      `[GFG] ✅ Fetched ${username}: score=${result.practiceScore}, solved=${result.problemsSolved}`
    );
    return result;
  } catch {
    // Fallback: scrape GFG profile page
    logger.warn(`[GFG] API failed for ${username}, falling back to scrape`);
    return scrapeGFGProfile(username);
  }
}

async function scrapeGFGProfile(username: string): Promise<GFGData> {
  const res = await axios.get(
    `https://www.geeksforgeeks.org/user/${username}/`,
    {
      headers: { "User-Agent": "ScoreBook-App/1.0" },
      timeout: 15000,
    }
  );

  const $ = cheerio.load(res.data);

  let practiceScore = 0;
  let problemsSolved = 0;

  // GFG score is usually in a scorecard section
  $(".scoreCard_head__nxXR5, .score_card_value, [class*='scoreCard']").each(
    (_i, el) => {
      const text = $(el).text().trim();
      const num = parseInt(text);
      if (!isNaN(num) && num > practiceScore) {
        practiceScore = num;
      }
    }
  );

  $("[class*='solved'], [class*='problem']").each((_i, el) => {
    const text = $(el).text().replace(/\D/g, "");
    const num = parseInt(text);
    if (!isNaN(num) && num > problemsSolved) {
      problemsSolved = num;
    }
  });

  return {
    username,
    practiceScore,
    problemsSolved,
    monthlyCodingScore: 0,
    codingStreak: 0,
    rank: 0,
    fetchedAt: new Date().toISOString(),
  };
}

export function extractGFGUsername(url: string): string | null {
  const match = url.match(/geeksforgeeks\.org\/user\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}
