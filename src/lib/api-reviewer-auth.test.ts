import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_AUTH_ERROR_CODE,
  REVIEWER_FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from './api-auth-errors.ts';
import {
  evaluateApiReviewerAccess,
  isAllowlistedReviewerId,
  parseSavedTubeReviewerIds,
  SAVEDTUBE_REVIEWER_IDS_ENV_NAME,
} from './api-reviewer-auth.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('SAVEDTUBE_REVIEWER_IDS_ENV_NAME', () => {
  it('uses the canonical environment variable name', () => {
    assert.equal(SAVEDTUBE_REVIEWER_IDS_ENV_NAME, 'SAVEDTUBE_REVIEWER_IDS');
  });
});

describe('parseSavedTubeReviewerIds', () => {
  it('returns empty for missing, empty, or whitespace-only allowlists', () => {
    assert.deepEqual(parseSavedTubeReviewerIds(undefined), []);
    assert.deepEqual(parseSavedTubeReviewerIds(null), []);
    assert.deepEqual(parseSavedTubeReviewerIds(''), []);
    assert.deepEqual(parseSavedTubeReviewerIds('   '), []);
  });

  it('trims whitespace around comma-separated IDs and drops empty entries', () => {
    assert.deepEqual(
      parseSavedTubeReviewerIds('  reviewer-a , reviewer-b,  ,reviewer-c  '),
      ['reviewer-a', 'reviewer-b', 'reviewer-c']
    );
  });
});

describe('isAllowlistedReviewerId', () => {
  it('requires exact ID match (no substring membership)', () => {
    assert.equal(isAllowlistedReviewerId('user-1', ['user-1', 'user-2']), true);
    assert.equal(isAllowlistedReviewerId('user', ['user-1']), false);
    assert.equal(isAllowlistedReviewerId('user-1', ['user']), false);
    assert.equal(isAllowlistedReviewerId('user-1', [' user-1 ']), false);
  });
});

describe('evaluateApiReviewerAccess', () => {
  it('authorizes an authenticated allowlisted reviewer', () => {
    const decision = evaluateApiReviewerAccess({
      userId: 'reviewer-ok',
      reviewerIdsEnv: 'other-id, reviewer-ok , third',
    });
    assert.equal(decision.authorized, true);
  });

  it('returns 403 for an authenticated non-reviewer', () => {
    const decision = evaluateApiReviewerAccess({
      userId: 'learner-owner',
      reviewerIdsEnv: 'reviewer-a,reviewer-b',
    });
    assert.equal(decision.authorized, false);
    if (decision.authorized) {
      assert.fail('expected forbidden decision');
    }
    assert.equal(decision.status, 403);
    assert.equal(decision.body.code, API_AUTH_ERROR_CODE.REVIEWER_FORBIDDEN);
    assert.equal(decision.body.error, REVIEWER_FORBIDDEN_MESSAGE);
  });

  it('returns 403 when the allowlist is missing or empty (fail closed)', () => {
    for (const reviewerIdsEnv of [undefined, null, '', '  ', ',,']) {
      const decision = evaluateApiReviewerAccess({
        userId: 'any-authenticated-user',
        reviewerIdsEnv,
      });
      assert.equal(decision.authorized, false);
      if (decision.authorized) {
        assert.fail('expected forbidden decision');
      }
      assert.equal(decision.status, 403);
      assert.equal(decision.body.code, API_AUTH_ERROR_CODE.REVIEWER_FORBIDDEN);
    }
  });

  it('returns 401 for unauthenticated callers', () => {
    for (const userId of [undefined, null, '']) {
      const decision = evaluateApiReviewerAccess({
        userId,
        reviewerIdsEnv: 'reviewer-ok',
      });
      assert.equal(decision.authorized, false);
      if (decision.authorized) {
        assert.fail('expected unauthenticated decision');
      }
      assert.equal(decision.status, 401);
      assert.equal(decision.body.code, API_AUTH_ERROR_CODE.UNAUTHENTICATED);
      assert.equal(decision.body.error, UNAUTHENTICATED_MESSAGE);
    }
  });
});

describe('requireApiReviewerSession wiring (source)', () => {
  it('requires requireApiSession then SAVEDTUBE_REVIEWER_IDS allowlist with 403', () => {
    const source = readFileSync(join(root, 'src/lib/api-auth.ts'), 'utf8');
    assert.match(source, /export async function requireApiReviewerSession/);
    assert.match(source, /requireApiSession\(\)/);
    assert.match(source, /SAVEDTUBE_REVIEWER_IDS_ENV_NAME/);
    assert.match(source, /evaluateApiReviewerAccess/);
    assert.match(source, /status:\s*decision\.status/);
    assert.match(
      source,
      /buildReviewerForbiddenErrorBody|evaluateApiReviewerAccess/
    );
    assert.doesNotMatch(source, /@|\.includes\(['"]@/);
    assert.doesNotMatch(source, /email.*domain|domain.*email/i);
    assert.doesNotMatch(source, /role\s*[:=]/);
    assert.doesNotMatch(source, /session\.user\.email/);
  });

  it('keeps reviewer policy free of ownership and client role fields', () => {
    const policy = readFileSync(
      join(root, 'src/lib/api-reviewer-auth.ts'),
      'utf8'
    );
    assert.match(policy, /SAVEDTUBE_REVIEWER_IDS/);
    assert.doesNotMatch(policy, /owner\s*===|path\.owner|session\.user\.role/);
    assert.doesNotMatch(policy, /@gmail|email\.endsWith|hostname/i);
  });
});
