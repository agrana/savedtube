import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET,
  RESEARCH_DEFAULT_USER_DAILY_BUDGET,
} from './config-research-defaults.ts';
import {
  APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST,
  RESEARCH_USER_DAILY_BUDGET_OVERRIDE,
  hashTrustedSessionEmailDigest,
  normalizeTrustedSessionEmail,
  resolveEffectiveUserDailyBudget,
  resolveEffectiveUserDailyBudgetFromDigest,
  withEffectiveUserDailyBudget,
} from './research-user-budget.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('research user daily budget override', () => {
  it('keeps default user and project caps unchanged', () => {
    assert.equal(RESEARCH_DEFAULT_USER_DAILY_BUDGET, 10);
    assert.equal(RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET, 200);
    assert.equal(RESEARCH_USER_DAILY_BUDGET_OVERRIDE, 50);
  });

  it('normalizes trusted email with trim and lowercase', () => {
    assert.equal(
      normalizeTrustedSessionEmail('  Ops@Example.COM \n'),
      'ops@example.com'
    );
  });

  it('hashes normalized email with SHA-256 hex', () => {
    const normalized = 'fixture-user@example.com';
    const expected = createHash('sha256')
      .update(normalized, 'utf8')
      .digest('hex');
    assert.equal(hashTrustedSessionEmailDigest(normalized), expected);
  });

  it('matches the approved digest via the digest fixture seam without a real email', () => {
    assert.equal(
      resolveEffectiveUserDailyBudgetFromDigest(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST
      ),
      RESEARCH_USER_DAILY_BUDGET_OVERRIDE
    );
  });

  it('applies override when digestFn returns the approved digest', () => {
    assert.equal(
      resolveEffectiveUserDailyBudget(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        'fixture-owner@example.com',
        {
          digestFn: () => APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST,
        }
      ),
      RESEARCH_USER_DAILY_BUDGET_OVERRIDE
    );
  });

  it('leaves other users on the default budget', () => {
    assert.equal(
      resolveEffectiveUserDailyBudget(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        'other-user@example.com'
      ),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
    assert.equal(
      resolveEffectiveUserDailyBudgetFromDigest(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      ),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
  });

  it('fails closed when trusted identity is missing or blank', () => {
    assert.equal(
      resolveEffectiveUserDailyBudget(RESEARCH_DEFAULT_USER_DAILY_BUDGET, null),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
    assert.equal(
      resolveEffectiveUserDailyBudget(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        undefined
      ),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
    assert.equal(
      resolveEffectiveUserDailyBudget(RESEARCH_DEFAULT_USER_DAILY_BUDGET, ''),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
    assert.equal(
      resolveEffectiveUserDailyBudget(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        '   '
      ),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
    assert.equal(
      resolveEffectiveUserDailyBudgetFromDigest(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        null
      ),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
    assert.equal(
      resolveEffectiveUserDailyBudgetFromDigest(
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        ''
      ),
      RESEARCH_DEFAULT_USER_DAILY_BUDGET
    );
  });

  it('normalizes before digestFn so casing and whitespace do not block override', () => {
    const seen: string[] = [];
    const budget = resolveEffectiveUserDailyBudget(
      RESEARCH_DEFAULT_USER_DAILY_BUDGET,
      '  Fixture-Owner@Example.COM  ',
      {
        digestFn: (normalized) => {
          seen.push(normalized);
          return APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST;
        },
      }
    );
    assert.deepEqual(seen, ['fixture-owner@example.com']);
    assert.equal(budget, RESEARCH_USER_DAILY_BUDGET_OVERRIDE);
  });

  it('withEffectiveUserDailyBudget only adjusts userDailyBudget', () => {
    const settings = withEffectiveUserDailyBudget(
      {
        userDailyBudget: RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        projectDailyBudget: RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET,
      },
      'fixture-owner@example.com',
      { digestFn: () => APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST }
    );
    assert.equal(settings.userDailyBudget, RESEARCH_USER_DAILY_BUDGET_OVERRIDE);
    assert.equal(
      settings.projectDailyBudget,
      RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET
    );
  });
});

describe('research user budget trust boundary', () => {
  it('wires session email into research and interval-suggestion reservation settings', () => {
    const researchRoute = readFileSync(
      join(root, 'src/app/api/paths/[pathId]/research/route.ts'),
      'utf8'
    );
    const intervalRoute = readFileSync(
      join(
        root,
        'src/app/api/paths/[pathId]/videos/[pathVideoId]/interval-suggestions/route.ts'
      ),
      'utf8'
    );

    assert.match(researchRoute, /withEffectiveUserDailyBudget/);
    assert.match(researchRoute, /auth\.session\.user\.email/);
    assert.equal(researchRoute.includes('body.email'), false);
    assert.equal(researchRoute.includes('body?.email'), false);

    assert.match(intervalRoute, /withEffectiveUserDailyBudget/);
    assert.match(intervalRoute, /auth\.session\.user\.email/);
    assert.equal(intervalRoute.includes('body.email'), false);
  });

  it('keeps crypto and digest override out of browser-imported modules', () => {
    const budgetSource = readFileSync(
      join(root, 'src/lib/research-user-budget.ts'),
      'utf8'
    );
    assert.match(budgetSource, /node:crypto/);
    assert.match(budgetSource, /APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST/);
    assert.equal(/@[a-z0-9.-]+\.[a-z]{2,}/i.test(budgetSource), false);

    const defaultsSource = readFileSync(
      join(root, 'src/lib/config-research-defaults.ts'),
      'utf8'
    );
    assert.equal(defaultsSource.includes('createHash'), false);
    assert.equal(defaultsSource.includes('node:crypto'), false);
    assert.equal(
      defaultsSource.includes('APPROVED_RESEARCH_BUDGET_EMAIL_DIGEST'),
      false
    );

    const pathMapSource = readFileSync(
      join(root, 'src/lib/path-map.ts'),
      'utf8'
    );
    assert.equal(pathMapSource.includes('research-user-budget'), false);

    const pathMapComponent = readFileSync(
      join(root, 'src/components/PathMap.tsx'),
      'utf8'
    );
    assert.equal(pathMapComponent.includes('research-user-budget'), false);
  });

  it('does not change reserve_generation_budget defaults in config', () => {
    const configSource = readFileSync(join(root, 'src/lib/config.ts'), 'utf8');
    assert.match(configSource, /RESEARCH_DEFAULT_USER_DAILY_BUDGET/);
    assert.match(configSource, /RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET/);
    assert.equal(
      configSource.includes('RESEARCH_USER_DAILY_BUDGET_OVERRIDE'),
      false
    );
  });

  it('copies trusted email from the JWT onto the session', () => {
    const authSource = readFileSync(join(root, 'src/lib/auth.ts'), 'utf8');
    assert.match(authSource, /session\.user\.email = token\.email/);
  });
});
