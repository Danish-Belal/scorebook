/**
 * ScoreBook API Client
 * ─────────────────────────────────────────────────────────────
 * ALL API calls go through this file.
 * To switch environments, change ONE variable: NEXT_PUBLIC_API_URL
 *
 * .env.local (development):
 *   NEXT_PUBLIC_API_URL=http://localhost:3001
 *
 * .env.production:
 *   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
 */

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ─── Core Fetch Wrapper ───────────────────────────────────────────────────────
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, err.error || "Request failed");
  }
  return res.json();
}

/** No cookies — for public profile pages viewable without auth */
async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, err.error || "Request failed");
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  githubUrl: () => `${BASE_URL}/auth/github`,
  googleUrl: () => `${BASE_URL}/auth/google`,
  register: (body: { email: string; password: string; displayName: string }) =>
    request<{ success: boolean; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ success: boolean; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getMe:     () => request<{ user: User }>("/auth/me"),
  logout:    () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  getMe: () =>
    request<{ user: User; platforms: PlatformProfile[]; scoreSnapshot: any }>(
      "/api/users/me"
    ),
  updateMe: (data: Partial<Pick<User, "displayName" | "bio" | "isPublic">>) =>
    request<{ user: User }>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  getById: (id: string) => request<PublicUserProfile>(`/api/users/${id}`),
};

// ─── Platforms ────────────────────────────────────────────────────────────────
export const platformsApi = {
  list: () =>
    request<{ platforms: PlatformStatus[]; hint?: string }>("/api/platforms"),
  sync: () =>
    request<{ success: boolean; queued: number; message: string }>("/api/platforms/sync", {
      method: "POST",
    }),
  connect: (profileUrl: string, platform?: string) =>
    request<{ success: boolean; platform: string; username: string; message: string }>(
      "/api/platforms/connect",
      { method: "POST", body: JSON.stringify({ profileUrl, platform }) }
    ),
  disconnect: (platform: string) =>
    request<{ success: boolean }>(`/api/platforms/${platform}`, { method: "DELETE" }),
};

// ─── Scores ───────────────────────────────────────────────────────────────────
export const scoresApi = {
  getMe: () => request<MyScoreResponse>("/api/scores/me"),
  getQueueStatus: () => request<ScoreQueueStatusResponse>("/api/scores/queue-status"),
  getLeaderboard: (params?: { page?: number; limit?: number; platform?: string }) => {
    const q = new URLSearchParams();
    if (params?.page)     q.set("page",     String(params.page));
    if (params?.limit)    q.set("limit",    String(params.limit));
    if (params?.platform) q.set("platform", params.platform);
    return request<LeaderboardResponse>(`/api/scores/leaderboard?${q}`);
  },
  getRank:    (userId: string) => request<RankResponse>(`/api/scores/rank/${userId}`),
  getHistory: (userId: string) => request<{ history: ScoreHistory[] }>(`/api/scores/history/${userId}`),
  /** Public read-only dashboard payload — no auth; respects user.isPublic on server */
  getPublicProfile: (userId: string) => publicRequest<MyScoreResponse>(`/api/scores/public/${userId}`),
  /** History is already public by userId on the API */
  getPublicHistory: (userId: string) => publicRequest<{ history: ScoreHistory[] }>(`/api/scores/history/${userId}`),
  refresh:    () => request<{ success: boolean; message: string }>("/api/scores/refresh", { method: "POST" }),
};

export const api = { auth: authApi, users: usersApi, platforms: platformsApi, scores: scoresApi };

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  githubLogin: string | null;
  createdAt: string;
  isPublic: boolean;
}

export interface PlatformProfile {
  platform: string;
  profileUrl: string;
  username: string | null;
  addedAt: string;
}

export interface PlatformStatus {
  platform: string;
  displayName: string;
  profileUrl: string;
  username: string | null;
  lastFetchedAt: string | null;
  fetchStatus: "pending" | "success" | "error";
  errorMessage: string | null;
  retryCount: number;
  /** Server bug / recoverable — use Re-sync */
  recoverableSyncError?: boolean;
}

/** BullMQ + DB snapshot for dashboard score spinner (queue name: `compute-score`) */
export interface ScoreQueueStatusResponse {
  job: {
    queueName: string;
    jobId: string;
    bullmqState: string;
    hint?: string;
    failedReason?: string;
    resultFinalScore?: number;
    finishedOn?: number | null;
    attemptsMade?: number;
  };
  /** Redis ZSET scorebook:leaderboard:global — what the API uses for ranks */
  redisLeaderboard?: {
    key: string;
    globalScore: number | null;
    isMember: boolean;
  };
  platformFetch: {
    pending: number;
    error: number;
    success: number;
    total: number;
  };
  database: {
    hasScoreRow: boolean;
    compositeScore: number | null;
    computedAt: string | null;
  };
}

export interface MyScoreResponse {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
  compositeScore: number;
  scoreLower: number | null;
  scoreUpper: number | null;
  rank: number | null;
  totalUsers: number;
  percentile: string | null;
  topPercent: string | null;
  recencyFactor: number | null;
  confidenceFactor: number | null;
  breakdown: Record<string, number | null>;
  detailedBreakdown: any;
  platforms: Record<string, PlatformSection>;
  computedAt: string;
  titles: PlatformTitle[];
  potentialScore: number | null;
  potentialNote: string | null;
  fairnessNote: string | null;
  message?: string;
}

export interface PlatformSection {
  displayName: string;
  fetchStatus: string;
  lastFetched: string;
  rawData: any;
  badge: string | null;
  rankAmongUs: number | null;
  totalOnPlatform: number | null;
  percentile: number | null;
  subScore: number | null;
}

export interface PlatformTitle {
  platform: string;
  title: string;
  rank: number | null;
  isGlobal: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  githubLogin: string | null;
  score: number;
  topPercent: string;
  codeforcesScore?: number;
  leetcodeScore?: number;
  githubScore?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  pagination: { page: number; limit: number; totalUsers: number; totalPages: number };
}

export interface RankResponse {
  rank: number;
  totalUsers: number;
  neighbors: LeaderboardEntry[];
}

export interface ScoreHistory {
  id: string;
  compositeScore: string;
  rank: number | null;
  snapshotDate: string;
}

export interface PublicUserProfile {
  user: Pick<User, "id" | "displayName" | "avatarUrl" | "githubLogin" | "createdAt">;
  platforms: { platform: string; username: string | null }[];
  scoreSnapshot: { compositeScore: number; computedAt: string } | null;
}
