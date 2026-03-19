import axios from "axios";
import { logger } from "../../config/logger";

const CF_BASE = "https://codeforces.com/api";

export interface CodeforcesUserInfo {
  handle: string;
  rating: number;
  maxRating: number;
  rank: string;
  maxRank: string;
  contribution: number;
  friendOfCount: number;
  titlePhoto: string;
  country?: string;
  organization?: string;
  registrationTimeSeconds: number;
}

export interface CodeforcesRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

export interface CodeforcesSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    rating?: number;
    tags: string[];
  };
  verdict?: string;
}

export interface CodeforcesData {
  userInfo: CodeforcesUserInfo;
  ratingHistory: CodeforcesRatingChange[];
  submissions: CodeforcesSubmission[];
  contestsParticipated: number;
  problemsSolvedByRating: Record<string, number>; // "800": 10, "1000": 8, ...
  uniqueProblemsSolved: number;
  fetchedAt: string;
}

export async function fetchCodeforcesData(
  username: string
): Promise<CodeforcesData> {
  logger.debug(`[Codeforces] Fetching data for ${username}`);

  // Fetch user info
  const userInfoRes = await axios.get(`${CF_BASE}/user.info`, {
    params: { handles: username },
    timeout: 10000,
  });

  if (userInfoRes.data.status !== "OK") {
    throw new Error(
      `Codeforces API error: ${userInfoRes.data.comment ?? "Unknown error"}`
    );
  }

  const userInfo: CodeforcesUserInfo = userInfoRes.data.result[0];

  // Fetch rating history
  const ratingRes = await axios.get(`${CF_BASE}/user.rating`, {
    params: { handle: username },
    timeout: 10000,
  });
  const ratingHistory: CodeforcesRatingChange[] =
    ratingRes.data.status === "OK" ? ratingRes.data.result : [];

  // Fetch recent submissions (up to 10,000)
  const submissionsRes = await axios.get(`${CF_BASE}/user.status`, {
    params: { handle: username, count: 10000 },
    timeout: 15000,
  });
  const allSubmissions: CodeforcesSubmission[] =
    submissionsRes.data.status === "OK" ? submissionsRes.data.result : [];

  // Process: unique accepted problems + problems by difficulty rating
  const acceptedProblemIds = new Set<string>();
  const problemsSolvedByRating: Record<string, number> = {};

  for (const sub of allSubmissions) {
    if (sub.verdict === "OK") {
      const problemId = `${sub.problem.contestId ?? ""}${sub.problem.index}`;
      if (!acceptedProblemIds.has(problemId)) {
        acceptedProblemIds.add(problemId);
        if (sub.problem.rating) {
          const ratingBucket = String(
            Math.floor(sub.problem.rating / 100) * 100
          );
          problemsSolvedByRating[ratingBucket] =
            (problemsSolvedByRating[ratingBucket] ?? 0) + 1;
        }
      }
    }
  }

  const result: CodeforcesData = {
    userInfo,
    ratingHistory,
    submissions: allSubmissions.slice(0, 500), // Store only recent 500 for space
    contestsParticipated: ratingHistory.length,
    problemsSolvedByRating,
    uniqueProblemsSolved: acceptedProblemIds.size,
    fetchedAt: new Date().toISOString(),
  };

  logger.info(
    `[Codeforces] ✅ Fetched ${username}: rating=${userInfo.rating}, problems=${result.uniqueProblemsSolved}, contests=${result.contestsParticipated}`
  );

  return result;
}

/** Extract username from Codeforces profile URL */
export function extractCodeforcesUsername(url: string): string | null {
  const match = url.match(
    /codeforces\.com\/(?:profile\/|contest\/.*?\/submission\/)?([A-Za-z0-9_.-]+)/
  );
  return match?.[1] ?? null;
}
