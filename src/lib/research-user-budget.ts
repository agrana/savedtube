/**
 * Account-specific daily research/generation budget override.
 * Digests trusted session email only (identity match, not authentication).
 * Keep out of Client Component import graphs — uses node:crypto.
 */

import { createHash } from 'node:crypto';

/** SHA-256 hex digest of the approved account email after trim + lowercase. */
export const APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST =
  '4970c031f3e3101eddd044ff50c10bd114003af3a201015eaee13b854f468b26';

/** Elevated per-user daily units for the approved digest only. */
export const RESEARCH_USER_DAILY_BUDGET_OVERRIDE = 50;

export type TrustedEmailDigestFn = (normalizedEmail: string) => string;

export function normalizeTrustedSessionEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashTrustedSessionEmailDigest(normalizedEmail: string): string {
  return createHash('sha256').update(normalizedEmail, 'utf8').digest('hex');
}

/**
 * Resolve effective per-user daily budget from a precomputed email digest.
 * Test fixture seam: pass the approved digest without a real email.
 * Missing/blank digest fails closed (default budget).
 */
export function resolveEffectiveUserDailyBudgetFromDigest(
  defaultUserDailyBudget: number,
  emailDigest: string | null | undefined
): number {
  if (typeof emailDigest !== 'string' || emailDigest.length === 0) {
    return defaultUserDailyBudget;
  }
  if (emailDigest === APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST) {
    return RESEARCH_USER_DAILY_BUDGET_OVERRIDE;
  }
  return defaultUserDailyBudget;
}

/**
 * Resolve effective per-user daily budget from trusted session email.
 * ownerId is not email — callers must pass session.user.email (or equivalent).
 * Missing/blank identity fails closed (default budget, no override).
 */
export function resolveEffectiveUserDailyBudget(
  defaultUserDailyBudget: number,
  trustedSessionEmail: string | null | undefined,
  options?: { digestFn?: TrustedEmailDigestFn }
): number {
  if (typeof trustedSessionEmail !== 'string') {
    return defaultUserDailyBudget;
  }
  const normalized = normalizeTrustedSessionEmail(trustedSessionEmail);
  if (!normalized) {
    return defaultUserDailyBudget;
  }
  const digestFn = options?.digestFn ?? hashTrustedSessionEmailDigest;
  return resolveEffectiveUserDailyBudgetFromDigest(
    defaultUserDailyBudget,
    digestFn(normalized)
  );
}

/** Apply effective user daily budget onto generation settings used at reservation. */
export function withEffectiveUserDailyBudget<
  T extends { userDailyBudget: number },
>(
  settings: T,
  trustedSessionEmail: string | null | undefined,
  options?: { digestFn?: TrustedEmailDigestFn }
): T {
  return {
    ...settings,
    userDailyBudget: resolveEffectiveUserDailyBudget(
      settings.userDailyBudget,
      trustedSessionEmail,
      options
    ),
  };
}
