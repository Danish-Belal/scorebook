import axios from "axios";
import { logger } from "../../config/logger";

const LC_GRAPHQL = "https://leetcode.com/graphql";

export interface LeetCodeData {
  username: string;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalSubmissions: number;
  acceptanceRate: number;
  ranking: number; // LeetCode global ranking
  contestRating: number;
  contestRanking: number; // global contest rank
  contestTopPercentage: number;
  attendedContests: number;
  badges: string[];
  streak: number;
  fetchedAt: string;
}

const USER_STATS_QUERY = `
query getUserStats($username: String!) {
  matchedUser(username: $username) {
    username
    submitStats {
      acSubmissionNum {
        difficulty
        count
        submissions
      }
      totalSubmissionNum {
        difficulty
        count
        submissions
      }
    }
    profile {
      ranking
      reputation
      starRating
    }
    badges {
      name
    }
    userCalendar {
      streak
      totalActiveDays
    }
  }
  userContestRanking(username: $username) {
    attendedContestsCount
    rating
    globalRanking
    topPercentage
    badge {
      name
    }
  }
}
`;

export async function fetchLeetCodeData(username: string): Promise<LeetCodeData> {
  logger.debug(`[LeetCode] Fetching data for ${username}`);

  const response = await axios.post(
    LC_GRAPHQL,
    { query: USER_STATS_QUERY, variables: { username } },
    {
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
        "x-csrftoken": "dummy", // public endpoint doesn't need real token
      },
      timeout: 15000,
    }
  );

  const { matchedUser, userContestRanking } = response.data.data ?? {};

  if (!matchedUser) {
    throw new Error(`LeetCode user '${username}' not found`);
  }

  const acStats = matchedUser.submitStats?.acSubmissionNum ?? [];
  const totalStats = matchedUser.submitStats?.totalSubmissionNum ?? [];

  const getCount = (stats: any[], diff: string) =>
    stats.find((s: any) => s.difficulty === diff)?.count ?? 0;
  const getSubmissions = (stats: any[], diff: string) =>
    stats.find((s: any) => s.difficulty === diff)?.submissions ?? 0;

  const totalSolved = getCount(acStats, "All");
  const totalSubmissions = getSubmissions(totalStats, "All");

  const result: LeetCodeData = {
    username,
    totalSolved,
    easySolved: getCount(acStats, "Easy"),
    mediumSolved: getCount(acStats, "Medium"),
    hardSolved: getCount(acStats, "Hard"),
    totalSubmissions,
    acceptanceRate:
      totalSubmissions > 0 ? (totalSolved / totalSubmissions) * 100 : 0,
    ranking: matchedUser.profile?.ranking ?? 0,
    contestRating: userContestRanking?.rating ?? 0,
    contestRanking: userContestRanking?.globalRanking ?? 0,
    contestTopPercentage: userContestRanking?.topPercentage ?? 100,
    attendedContests: userContestRanking?.attendedContestsCount ?? 0,
    badges: (matchedUser.badges ?? []).map((b: any) => b.name),
    streak: matchedUser.userCalendar?.streak ?? 0,
    fetchedAt: new Date().toISOString(),
  };

  logger.info(
    `[LeetCode] ✅ Fetched ${username}: solved=${result.totalSolved}, contestRating=${result.contestRating}`
  );

  return result;
}

/** Extract username from LeetCode profile URL */
export function extractLeetCodeUsername(url: string): string | null {
  const match = url.match(/leetcode\.com\/(?:u\/)?([A-Za-z0-9_.-]+)\/?$/);
  return match?.[1] ?? null;
}
