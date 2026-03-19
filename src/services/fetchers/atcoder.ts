import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../../config/logger";

export interface AtCoderData {
  username: string;
  rating: number;
  maxRating: number;
  rank: string; // color: grey, brown, green, cyan, blue, yellow, orange, red
  contestsParticipated: number;
  winCount: number; // times ranked 1st
  fetchedAt: string;
}

const RATING_COLOR_MAP: Record<number, string> = {
  400: "grey",
  800: "brown",
  1200: "green",
  1600: "cyan",
  2000: "blue",
  2400: "yellow",
  2800: "orange",
  9999: "red",
};

function ratingToColor(rating: number): string {
  for (const [threshold, color] of Object.entries(RATING_COLOR_MAP)) {
    if (rating < Number(threshold)) return color;
  }
  return "red";
}

export async function fetchAtCoderData(username: string): Promise<AtCoderData> {
  logger.debug(`[AtCoder] Fetching data for ${username}`);

  const res = await axios.get(`https://atcoder.jp/users/${username}`, {
    headers: { "User-Agent": "ScoreBook-App/1.0 (public data aggregator)" },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);

  // Extract rating from profile page
  // AtCoder shows rating in: <span class="user-{color}">NUMBER</span>
  let rating = 0;
  let maxRating = 0;

  // Find rating in the table rows
  $("table.dl-table tr, .row td").each((_i, el) => {
    const label = $(el).find("th").text().trim();
    const value = $(el).find("td").text().trim();
    if (label === "Rating") rating = parseInt(value) || 0;
    if (label === "Highest Rating") maxRating = parseInt(value) || 0;
  });

  // Alternative: find in the user stats section
  if (rating === 0) {
    $("tr").each((_i, el) => {
      const tds = $(el).find("td");
      if ($(tds[0]).text().trim() === "Rating") {
        rating = parseInt($(tds[1]).text().trim()) || 0;
      }
      if ($(tds[0]).text().trim() === "Highest Rating") {
        maxRating = parseInt($(tds[1]).text().trim()) || 0;
      }
    });
  }

  // Scrape contest history count from the history page
  let contestsParticipated = 0;
  let winCount = 0;

  try {
    const historyRes = await axios.get(
      `https://atcoder.jp/users/${username}/history`,
      {
        headers: { "User-Agent": "ScoreBook-App/1.0" },
        timeout: 10000,
      }
    );
    const $h = cheerio.load(historyRes.data);
    const rows = $h("table#history tbody tr");
    contestsParticipated = rows.length;
    rows.each((_i, el) => {
      const rank = parseInt($h(el).find("td").first().text().trim());
      if (rank === 1) winCount++;
    });
  } catch {
    // history page might be unavailable, use defaults
  }

  const result: AtCoderData = {
    username,
    rating,
    maxRating: maxRating || rating,
    rank: ratingToColor(rating),
    contestsParticipated,
    winCount,
    fetchedAt: new Date().toISOString(),
  };

  logger.info(
    `[AtCoder] ✅ Fetched ${username}: rating=${result.rating}, contests=${result.contestsParticipated}`
  );

  return result;
}

export function extractAtCoderUsername(url: string): string | null {
  const match = url.match(/atcoder\.jp\/users\/([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}
