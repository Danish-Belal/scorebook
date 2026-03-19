import { PlatformName } from "../../models/schema";
import { fetchCodeforcesData, extractCodeforcesUsername } from "./codeforces";
import { fetchLeetCodeData,   extractLeetCodeUsername   } from "./leetcode";
import { fetchGitHubData,     extractGitHubUsername     } from "./github";
import { fetchAtCoderData,    extractAtCoderUsername    } from "./atcoder";
import { fetchGFGData,        extractGFGUsername        } from "./gfg";
import {
  fetchCodeChefData,    extractCodeChefUsername,
  fetchHackerRankData,  extractHackerRankUsername,
  fetchHackerEarthData, extractHackerEarthUsername,
  fetchTopCoderData,    extractTopCoderUsername,
} from "./new_platforms";

type FetchFn   = (u: string) => Promise<any>;
type ExtractFn = (url: string) => string | null;

const FETCHERS: Record<PlatformName, FetchFn> = {
  codeforces:  fetchCodeforcesData,
  leetcode:    fetchLeetCodeData,
  github:      fetchGitHubData,
  atcoder:     fetchAtCoderData,
  gfg:         fetchGFGData,
  codechef:    fetchCodeChefData,
  hackerrank:  fetchHackerRankData,
  hackerearth: fetchHackerEarthData,
  topcoder:    fetchTopCoderData,
};

const EXTRACTORS: Record<PlatformName, ExtractFn> = {
  codeforces:  extractCodeforcesUsername,
  leetcode:    extractLeetCodeUsername,
  github:      extractGitHubUsername,
  atcoder:     extractAtCoderUsername,
  gfg:         extractGFGUsername,
  codechef:    extractCodeChefUsername,
  hackerrank:  extractHackerRankUsername,
  hackerearth: extractHackerEarthUsername,
  topcoder:    extractTopCoderUsername,
};

export async function fetchPlatformData(platform: PlatformName, username: string): Promise<any> {
  const fn = FETCHERS[platform];
  if (!fn) throw new Error(`No fetcher for platform: ${platform}`);
  return fn(username);
}

export function extractUsername(platform: PlatformName, url: string): string | null {
  return EXTRACTORS[platform]?.(url) ?? null;
}

export function detectPlatformFromUrl(url: string): PlatformName | null {
  if (url.includes("codeforces.com"))     return "codeforces";
  if (url.includes("leetcode.com"))       return "leetcode";
  if (url.includes("github.com"))         return "github";
  if (url.includes("atcoder.jp"))         return "atcoder";
  if (url.includes("geeksforgeeks.org"))  return "gfg";
  if (url.includes("codechef.com"))       return "codechef";
  if (url.includes("hackerrank.com"))     return "hackerrank";
  if (url.includes("hackerearth.com"))    return "hackerearth";
  if (url.includes("topcoder.com"))       return "topcoder";
  return null;
}

export const PLATFORM_DISPLAY_NAMES: Record<PlatformName, string> = {
  codeforces:  "Codeforces",
  leetcode:    "LeetCode",
  github:      "GitHub",
  atcoder:     "AtCoder",
  gfg:         "GeeksForGeeks",
  codechef:    "CodeChef",
  hackerrank:  "HackerRank",
  hackerearth: "HackerEarth",
  topcoder:    "TopCoder",
};

export const PLATFORM_EXAMPLES: Record<PlatformName, string> = {
  codeforces:  "https://codeforces.com/profile/tourist",
  leetcode:    "https://leetcode.com/u/neal_wu",
  github:      "https://github.com/torvalds",
  atcoder:     "https://atcoder.jp/users/tourist",
  gfg:         "https://www.geeksforgeeks.org/user/yourusername",
  codechef:    "https://www.codechef.com/users/gennady",
  hackerrank:  "https://www.hackerrank.com/yourusername",
  hackerearth: "https://www.hackerearth.com/@yourusername",
  topcoder:    "https://www.topcoder.com/members/yourusername",
};
