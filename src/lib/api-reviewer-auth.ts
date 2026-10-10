/**
 * Fail-closed reviewer authorization policy for future global-rule review.
 * Authority is an explicit environment allowlist of user IDs only — never
 * email-domain heuristics, client-provided roles, or ordinary path ownership.
 */

import {
  buildReviewerForbiddenErrorBody,
  buildUnauthenticatedErrorBody,
  type ApiAuthErrorBody,
} from './api-auth-errors';

/** Comma-separated authenticated user IDs permitted as reviewers. */
export const SAVEDTUBE_REVIEWER_IDS_ENV_NAME = 'SAVEDTUBE_REVIEWER_IDS';

export type ApiReviewerAccessDecision =
  | { authorized: true }
  | {
      authorized: false;
      status: 401 | 403;
      body: ApiAuthErrorBody;
    };

/**
 * Parse SAVEDTUBE_REVIEWER_IDS: comma-separated IDs with per-entry trim.
 * Missing, blank, or whitespace-only values yield an empty allowlist (deny).
 */
export function parseSavedTubeReviewerIds(
  raw: string | undefined | null
): string[] {
  if (raw == null || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Exact allowlist membership after trimming allowlist entries.
 * Substring / partial ID matches are rejected.
 */
export function isAllowlistedReviewerId(
  userId: string,
  allowlist: readonly string[]
): boolean {
  return allowlist.some((allowedId) => allowedId === userId);
}

/**
 * Pure reviewer access decision (no I/O). Fail closed when unauthenticated,
 * when the allowlist is missing/empty, or when the user ID is absent from it.
 */
export function evaluateApiReviewerAccess(input: {
  userId: string | null | undefined;
  reviewerIdsEnv: string | undefined | null;
}): ApiReviewerAccessDecision {
  const userId = input.userId;
  if (userId == null || userId.length === 0) {
    return {
      authorized: false,
      status: 401,
      body: buildUnauthenticatedErrorBody(),
    };
  }

  const allowlist = parseSavedTubeReviewerIds(input.reviewerIdsEnv);
  if (allowlist.length === 0 || !isAllowlistedReviewerId(userId, allowlist)) {
    return {
      authorized: false,
      status: 403,
      body: buildReviewerForbiddenErrorBody(),
    };
  }

  return { authorized: true };
}
