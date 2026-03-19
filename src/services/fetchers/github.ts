import axios from "axios";
import { logger } from "../../config/logger";
import { env } from "../../config/env";

const GH_API = "https://api.github.com";
const GH_GRAPHQL = "https://api.github.com/graphql";

export interface GitHubData {
  username: string;
  followers: number;
  following: number;
  publicRepos: number;
  totalStarsEarned: number;
  totalForks: number;
  // Contributions (last 12 months)
  totalCommitsLastYear: number;
  totalPRsLastYear: number;
  totalPRsMergedLastYear: number;
  totalIssuesLastYear: number;
  totalReviewsLastYear: number;
  contributionStreak: number;
  totalContributionDays: number;
  // All time
  totalMergedPRs: number;
  topLanguages: string[];
  accountAgeDays: number;
  fetchedAt: string;
}

const CONTRIBUTIONS_QUERY = `
query getContributions($login: String!) {
  user(login: $login) {
    followers { totalCount }
    following { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      nodes {
        stargazerCount
        forkCount
        primaryLanguage { name }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
          }
        }
      }
    }
    pullRequests(states: MERGED) {
      totalCount
    }
    createdAt
  }
}
`;

export async function fetchGitHubData(username: string): Promise<GitHubData> {
  logger.debug(`[GitHub] Fetching data for ${username}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "ScoreBook-App",
  };

  if (env.GITHUB_PAT) {
    headers["Authorization"] = `Bearer ${env.GITHUB_PAT}`;
  }

  // REST: basic profile
  const profileRes = await axios.get(`${GH_API}/users/${username}`, {
    headers,
    timeout: 10000,
  });
  const profile = profileRes.data;

  // GraphQL: contributions & repos
  const gqlRes = await axios.post(
    GH_GRAPHQL,
    { query: CONTRIBUTIONS_QUERY, variables: { login: username } },
    { headers, timeout: 15000 }
  );

  const user = gqlRes.data?.data?.user;
  if (!user) {
    throw new Error(`GitHub user '${username}' not found or API error`);
  }

  const contrib = user.contributionsCollection;
  const repos = user.repositories?.nodes ?? [];

  // Aggregate stars & forks
  let totalStars = 0;
  let totalForks = 0;
  const languageCounts: Record<string, number> = {};

  for (const repo of repos) {
    totalStars += repo.stargazerCount ?? 0;
    totalForks += repo.forkCount ?? 0;
    if (repo.primaryLanguage?.name) {
      const lang = repo.primaryLanguage.name;
      languageCounts[lang] = (languageCounts[lang] ?? 0) + 1;
    }
  }

  // Compute contribution streak from calendar
  const allDays =
    contrib.contributionCalendar?.weeks
      ?.flatMap((w: any) => w.contributionDays)
      ?.sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      ) ?? [];

  let streak = 0;
  for (const day of allDays) {
    if (day.contributionCount > 0) streak++;
    else break;
  }

  const activeDays = allDays.filter((d: any) => d.contributionCount > 0).length;

  const topLanguages = Object.entries(languageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([lang]) => lang);

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const result: GitHubData = {
    username,
    followers: user.followers?.totalCount ?? profile.followers ?? 0,
    following: user.following?.totalCount ?? profile.following ?? 0,
    publicRepos: profile.public_repos ?? repos.length,
    totalStarsEarned: totalStars,
    totalForks,
    totalCommitsLastYear: contrib.totalCommitContributions ?? 0,
    totalPRsLastYear: contrib.totalPullRequestContributions ?? 0,
    totalPRsMergedLastYear: Math.floor(
      (contrib.totalPullRequestContributions ?? 0) * 0.7
    ), // Estimate; exact merge count requires per-PR query
    totalIssuesLastYear: contrib.totalIssueContributions ?? 0,
    totalReviewsLastYear: contrib.totalPullRequestReviewContributions ?? 0,
    contributionStreak: streak,
    totalContributionDays: activeDays,
    totalMergedPRs: user.pullRequests?.totalCount ?? 0,
    topLanguages,
    accountAgeDays,
    fetchedAt: new Date().toISOString(),
  };

  logger.info(
    `[GitHub] ✅ Fetched ${username}: commits=${result.totalCommitsLastYear}, stars=${result.totalStarsEarned}, PRs=${result.totalMergedPRs}`
  );

  return result;
}

export function extractGitHubUsername(url: string): string | null {
  const match = url.match(/github\.com\/([A-Za-z0-9_-]+)\/?$/);
  return match?.[1] ?? null;
}
