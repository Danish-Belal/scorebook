// ─── CodeChef Fetcher ─────────────────────────────────────────────────────────
import axios from "axios";
import * as cheerio from "cheerio";

export interface CodeChefData {
  username: string;
  currentRating: number;
  maxRating: number;
  stars: number;           // 1-7 stars
  division: string;        // Div 1/2/3/4
  globalRank: number;
  countryRank: number;
  problemsSolved: number;
  contestsParticipated: number;
  badges: string[];
  fetchedAt: string;
}

export async function fetchCodeChefData(username: string): Promise<CodeChefData> {
  // CodeChef profile page scrape (no official public API for user stats)
  const res = await axios.get(`https://www.codechef.com/users/${username}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ScoreBook/1.0)",
      "Accept": "text/html",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);

  // Rating from the rating widget
  let currentRating = 0;
  let maxRating = 0;
  let stars = 0;

  // CodeChef embeds rating in a script tag as JSON or in specific divs
  $("script").each((_i, el) => {
    const text = $(el).html() ?? "";
    const ratingMatch = text.match(/"currentRating"\s*:\s*(\d+)/);
    const maxMatch = text.match(/"highestRating"\s*:\s*(\d+)/);
    if (ratingMatch) currentRating = parseInt(ratingMatch[1]);
    if (maxMatch) maxRating = parseInt(maxMatch[1]);
  });

  // Fallback: parse from rating display element
  if (currentRating === 0) {
    const ratingText = $(".rating-number").first().text().trim();
    currentRating = parseInt(ratingText) || 0;
  }

  // Stars from rating tier display
  const starText = $(".user-country-rank, .rating").text();
  const starsMatch = starText.match(/(\d)\s*\u2605/);
  stars = starsMatch ? parseInt(starsMatch[1]) : ratingToStars(currentRating);

  // Problems solved and contest count
  let problemsSolved = 0;
  let contestsParticipated = 0;
  let globalRank = 0;
  let countryRank = 0;

  $(".rating-data-section").each((_i, el) => {
    const label = $(el).find("h5").text().trim();
    const value = $(el).find(".rating-number, .data-number").text().trim();
    if (label.toLowerCase().includes("problem")) problemsSolved = parseInt(value) || 0;
    if (label.toLowerCase().includes("contest")) contestsParticipated = parseInt(value) || 0;
  });

  // Also try JSON-LD structured data
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      if (data.interactionStatistic) {
        for (const stat of data.interactionStatistic) {
          if (stat.name === "Contests Participated") contestsParticipated = stat.userInteractionCount || 0;
        }
      }
    } catch {}
  });

  // Division from rating
  const division = ratingToDivision(currentRating);

  return {
    username,
    currentRating,
    maxRating: maxRating || currentRating,
    stars,
    division,
    globalRank,
    countryRank,
    problemsSolved,
    contestsParticipated,
    badges: [],
    fetchedAt: new Date().toISOString(),
  };
}

function ratingToStars(rating: number): number {
  if (rating >= 2500) return 7;
  if (rating >= 2200) return 6;
  if (rating >= 2000) return 5;
  if (rating >= 1800) return 4;
  if (rating >= 1600) return 3;
  if (rating >= 1400) return 2;
  return 1;
}

function ratingToDivision(rating: number): string {
  if (rating >= 1800) return "Div 1";
  if (rating >= 1600) return "Div 2";
  if (rating >= 1400) return "Div 3";
  return "Div 4";
}

export function extractCodeChefUsername(url: string): string | null {
  const match = url.match(/codechef\.com\/users\/([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}


// ─── HackerRank Fetcher ───────────────────────────────────────────────────────
export interface HackerRankData {
  username: string;
  overallScore: number;
  level: string;           // "3 stars", "5 stars" etc
  certifications: string[]; // e.g. ["Problem Solving (Gold)", "Python (Silver)"]
  problemsSolved: number;
  badges: { name: string; stars: number }[];
  fetchedAt: string;
}

export async function fetchHackerRankData(username: string): Promise<HackerRankData> {
  // HackerRank has an undocumented REST profile API
  const res = await axios.get(
    `https://www.hackerrank.com/rest/hackers/${username}/profile`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScoreBook/1.0)",
        "Referer": "https://www.hackerrank.com",
      },
      timeout: 10000,
    }
  );

  const profile = res.data?.model ?? {};

  // Fetch badges separately
  let badges: { name: string; stars: number }[] = [];
  try {
    const badgesRes = await axios.get(
      `https://www.hackerrank.com/rest/hackers/${username}/badges`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScoreBook/1.0)" },
        timeout: 8000,
      }
    );
    badges = (badgesRes.data?.models ?? []).map((b: any) => ({
      name: b.name,
      stars: b.stars ?? 0,
    }));
  } catch {}

  // Calculate weighted score from badges (gold=3pts, silver=2pts, bronze=1pt per star)
  const overallScore = badges.reduce((sum, b) => sum + b.stars * 10, 0);

  return {
    username,
    overallScore,
    level: profile.level ?? "",
    certifications: (profile.skills_verified ?? []).map((s: any) => s.skill_name),
    problemsSolved: profile.solved_challenges ?? 0,
    badges,
    fetchedAt: new Date().toISOString(),
  };
}

export function extractHackerRankUsername(url: string): string | null {
  const match = url.match(/hackerrank\.com\/([A-Za-z0-9_]+)\/?$/);
  return match?.[1] ?? null;
}


// ─── HackerEarth Fetcher ──────────────────────────────────────────────────────
export interface HackerEarthData {
  username: string;
  currentRating: number;
  percentile: number;
  problemsSolved: number;
  contestsEntered: number;
  fetchedAt: string;
}

export async function fetchHackerEarthData(username: string): Promise<HackerEarthData> {
  // HackerEarth has a public profile API endpoint
  const res = await axios.get(
    `https://www.hackerearth.com/api/developer-profiles/${username}/`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScoreBook/1.0)" },
      timeout: 10000,
    }
  );

  const data = res.data ?? {};

  return {
    username,
    currentRating: data.data?.basic?.current_rating ?? 0,
    percentile: data.data?.basic?.percentile ?? 0,
    problemsSolved: data.data?.basic?.problems_solved ?? 0,
    contestsEntered: data.data?.basic?.contests_participated ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

export function extractHackerEarthUsername(url: string): string | null {
  const match = url.match(/hackerearth\.com\/profile\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}


// ─── TopCoder Fetcher ─────────────────────────────────────────────────────────
export interface TopCoderData {
  username: string;
  algorithmRating: number;
  maxRating: number;
  algorithmRank: string;  // e.g. "Yellow", "Red", "Target"
  contestsEntered: number;
  fetchedAt: string;
}

export async function fetchTopCoderData(username: string): Promise<TopCoderData> {
  // TopCoder v2 API
  const res = await axios.get(
    `https://api.topcoder.com/v2/users/${username}`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScoreBook/1.0)" },
      timeout: 12000,
    }
  );

  const data = res.data?.result?.content ?? {};
  const algoRating = data.ratingSummary?.find((r: any) => r.name === "Algorithm") ?? {};

  return {
    username,
    algorithmRating: algoRating.rating ?? 0,
    maxRating: algoRating.maxRating ?? algoRating.rating ?? 0,
    algorithmRank: ratingToTopCoderColor(algoRating.rating ?? 0),
    contestsEntered: algoRating.competitions ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

function ratingToTopCoderColor(rating: number): string {
  if (rating >= 2200) return "Red";
  if (rating >= 1500) return "Yellow";
  if (rating >= 1200) return "Blue";
  if (rating >= 900)  return "Green";
  return "Grey";
}

export function extractTopCoderUsername(url: string): string | null {
  const match = url.match(/topcoder\.com\/members\/([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}
