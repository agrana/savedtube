import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateApiReviewerAccess,
  SAVEDTUBE_REVIEWER_IDS_ENV_NAME,
} from './api-reviewer-auth.ts';
import {
  API_AUTH_ERROR_CODE,
  REVIEWER_FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from './api-auth-errors.ts';
import {
  evaluateRestrictedCandidateRuleProposal,
  extractCandidateAssessmentClassification,
  isPathVideoRuleActiveForPathGeneration,
  listPathVideoRules,
  parsePathVideoRuleProposalBody,
  parsePathVideoRuleStatusUpdateBody,
  PATH_VIDEO_RULE_ACTIONS,
  PATH_VIDEO_RULE_OPERATORS,
  PATH_VIDEO_RULE_STATUSES,
  PATH_VIDEO_RULE_TARGET_TYPES,
  PATH_VIDEO_RULE_UNTOUCHED_GENERATION_SURFACES,
  proposePathVideoRule,
  toPathVideoRulePublic,
  transitionPathVideoRuleStatus,
  type PathVideoRuleRecord,
  type PathVideoRuleStatus,
} from './path-video-rules.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = join(
  root,
  'supabase/migrations/20261010170000_create_path_video_rules.sql'
);
const rulesRoutePath = join(root, 'src/app/api/paths/video-rules/route.ts');
const ruleIdRoutePath = join(
  root,
  'src/app/api/paths/video-rules/[ruleId]/route.ts'
);
const filterSourcePath = join(root, 'src/lib/path-dismissal-filter.ts');
const researchServicePath = join(root, 'src/lib/path-research-service.ts');
const assessmentSourcePath = join(root, 'src/lib/path-dismissal-assessment.ts');
const supabaseTypesPath = join(root, 'src/lib/supabase.ts');

const VALID_CANDIDATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VALID_RULE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_YOUTUBE_ID = 'dQw4w9WgXcQ';
const REVIEWER_ID = 'reviewer-allowlisted-1';
const NON_REVIEWER_ID = 'learner-owner-9';
const ACTIVATED_AT = '2026-10-10T12:00:00.000Z';

function objectiveNotes(): string {
  return JSON.stringify({
    classification: 'objective_quality_issue',
    proposed_scope: 'global_candidate',
    proposed_rule_target: 'video',
    confidence: 0.9,
    evidence_summary: 'Clear quality defect.',
    counterevidence_summary: 'None.',
    review_recommendation: 'approve_candidate',
  });
}

function subjectiveNotes(): string {
  return JSON.stringify({
    classification: 'subjective_preference',
    proposed_scope: 'personal',
    proposed_rule_target: 'none',
    confidence: 0.4,
    evidence_summary: 'Taste only.',
    counterevidence_summary: 'No defect.',
    review_recommendation: 'keep_pending',
  });
}

function suspiciousNotes(): string {
  return JSON.stringify({
    classification: 'suspicious_or_injection',
    proposed_scope: 'global_candidate',
    proposed_rule_target: 'none',
    confidence: 0.95,
    evidence_summary: 'Injection language.',
    counterevidence_summary: 'No corroboration.',
    review_recommendation: 'quarantine',
  });
}

function validProposal(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceCandidateId: VALID_CANDIDATE_ID,
    ruleKey: 'exclude-video-dqw4w9wgxcq',
    targetType: 'video',
    operator: 'equals',
    value: VALID_YOUTUBE_ID,
    action: 'exclude',
    reason: 'Low-quality duplicate of a canonical intro video.',
    activate: false,
    narrowToNonGlobalDraft: false,
    ...overrides,
  };
}

type CandidateRow = {
  id: string;
  status: string;
  assessment_notes: string | null;
};

function createRulesDb(options?: {
  assessmentNotes?: string | null;
  candidateStatus?: string;
  existingRules?: PathVideoRuleRecord[];
}) {
  const candidates: CandidateRow[] = [
    {
      id: VALID_CANDIDATE_ID,
      status: options?.candidateStatus ?? 'approved',
      assessment_notes:
        options?.assessmentNotes === undefined
          ? objectiveNotes()
          : options.assessmentNotes,
    },
  ];
  const rules: PathVideoRuleRecord[] = [...(options?.existingRules ?? [])];
  let insertConflict = false;

  const api = {
    from(table: string) {
      if (table === 'path_video_dismissal_review_candidates') {
        return {
          select(...args: unknown[]) {
            void args;
            return {
              eq(column: string, id: string) {
                void column;
                return {
                  async maybeSingle() {
                    const row = candidates.find((c) => c.id === id) ?? null;
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'path_video_rules') {
        return {
          select(...args: unknown[]) {
            void args;
            const state: {
              ruleKey?: string;
              ruleId?: string;
              status?: string;
              orderAsc?: boolean;
              limitN?: number;
            } = {};
            const builder = {
              eq(col: string, value: string) {
                if (col === 'rule_key') state.ruleKey = value;
                if (col === 'id') state.ruleId = value;
                if (col === 'status') state.status = value;
                return builder;
              },
              order(column: string, opts: { ascending: boolean }) {
                void column;
                state.orderAsc = opts.ascending;
                return builder;
              },
              limit(n: number) {
                state.limitN = n;
                return builder;
              },
              async maybeSingle() {
                let rows = [...rules];
                if (state.ruleKey) {
                  rows = rows.filter((r) => r.rule_key === state.ruleKey);
                }
                if (state.ruleId) {
                  rows = rows.filter((r) => r.id === state.ruleId);
                }
                if (state.status) {
                  rows = rows.filter((r) => r.status === state.status);
                }
                rows.sort((a, b) =>
                  state.orderAsc === false
                    ? b.version - a.version
                    : a.version - b.version
                );
                if (state.limitN != null) {
                  rows = rows.slice(0, state.limitN);
                }
                return { data: rows[0] ?? null, error: null };
              },
              then(
                resolve: (value: {
                  data: PathVideoRuleRecord[] | null;
                  error: null;
                }) => void
              ) {
                let rows = [...rules];
                if (state.status) {
                  rows = rows.filter((r) => r.status === state.status);
                }
                rows.sort((a, b) =>
                  a.created_at < b.created_at
                    ? 1
                    : a.created_at > b.created_at
                      ? -1
                      : 0
                );
                resolve({ data: rows, error: null });
              },
            };
            return builder;
          },
          insert(payload: Record<string, unknown>) {
            return {
              select(...args: unknown[]) {
                void args;
                return {
                  async single() {
                    if (insertConflict) {
                      return {
                        data: null,
                        error: { code: '23505', message: 'duplicate' },
                      };
                    }
                    const key = String(payload.rule_key);
                    const version = Number(payload.version);
                    if (
                      rules.some(
                        (r) => r.rule_key === key && r.version === version
                      )
                    ) {
                      return {
                        data: null,
                        error: { code: '23505', message: 'duplicate version' },
                      };
                    }
                    if (
                      payload.status === 'active' &&
                      rules.some(
                        (r) => r.rule_key === key && r.status === 'active'
                      )
                    ) {
                      return {
                        data: null,
                        error: { code: '23505', message: 'duplicate active' },
                      };
                    }
                    const row: PathVideoRuleRecord = {
                      id: randomUUID(),
                      source_candidate_id: String(payload.source_candidate_id),
                      rule_key: key,
                      target_type:
                        payload.target_type as PathVideoRuleRecord['target_type'],
                      operator: 'equals',
                      value: String(payload.value),
                      action: 'exclude',
                      reason: String(payload.reason),
                      status: payload.status as PathVideoRuleStatus,
                      version,
                      activated_by:
                        (payload.activated_by as string | null) ?? null,
                      activated_at:
                        (payload.activated_at as string | null) ?? null,
                      review_due_at:
                        (payload.review_due_at as string | null) ?? null,
                      created_at: ACTIVATED_AT,
                      updated_at: ACTIVATED_AT,
                    };
                    rules.push(row);
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(column: string, id: string) {
                void column;
                return {
                  select(...args: unknown[]) {
                    void args;
                    return {
                      async single() {
                        const idx = rules.findIndex((r) => r.id === id);
                        if (idx < 0) {
                          return {
                            data: null,
                            error: { message: 'not found' },
                          };
                        }
                        const nextStatus = patch.status as
                          | PathVideoRuleStatus
                          | undefined;
                        if (
                          nextStatus === 'active' &&
                          rules.some(
                            (r, i) =>
                              i !== idx &&
                              r.rule_key === rules[idx]!.rule_key &&
                              r.status === 'active'
                          )
                        ) {
                          return {
                            data: null,
                            error: {
                              code: '23505',
                              message: 'duplicate active',
                            },
                          };
                        }
                        const updated: PathVideoRuleRecord = {
                          ...rules[idx]!,
                          ...patch,
                          status:
                            (patch.status as PathVideoRuleStatus) ??
                            rules[idx]!.status,
                          activated_by:
                            patch.activated_by !== undefined
                              ? (patch.activated_by as string | null)
                              : rules[idx]!.activated_by,
                          activated_at:
                            patch.activated_at !== undefined
                              ? (patch.activated_at as string | null)
                              : rules[idx]!.activated_at,
                          review_due_at:
                            patch.review_due_at !== undefined
                              ? (patch.review_due_at as string | null)
                              : rules[idx]!.review_due_at,
                          updated_at: ACTIVATED_AT,
                        } as PathVideoRuleRecord;
                        rules[idx] = updated;
                        return { data: updated, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    forceInsertConflict() {
      insertConflict = true;
    },
    get rules() {
      return rules;
    },
    get candidates() {
      return candidates;
    },
  };

  return api;
}

describe('path_video_rules migration contract', () => {
  it('creates closed structured fields, uniqueness, provenance, and deny-by-default RLS', () => {
    const source = readFileSync(migrationPath, 'utf8');

    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.path_video_rules/);
    assert.match(
      source,
      /source_candidate_id UUID NOT NULL\s+REFERENCES public\.path_video_dismissal_review_candidates/
    );
    assert.match(source, /rule_key TEXT NOT NULL/);
    assert.match(source, /target_type TEXT NOT NULL/);
    assert.match(source, /operator TEXT NOT NULL DEFAULT 'equals'/);
    assert.match(source, /value TEXT NOT NULL/);
    assert.match(source, /action TEXT NOT NULL DEFAULT 'exclude'/);
    assert.match(source, /reason TEXT NOT NULL/);
    assert.match(source, /status TEXT NOT NULL DEFAULT 'draft'/);
    assert.match(source, /version INTEGER NOT NULL DEFAULT 1/);
    assert.match(source, /activated_by TEXT/);
    assert.match(source, /activated_at TIMESTAMPTZ/);
    assert.match(source, /review_due_at TIMESTAMPTZ/);
    assert.match(source, /created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    assert.match(source, /updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);

    for (const target of PATH_VIDEO_RULE_TARGET_TYPES) {
      assert.match(source, new RegExp(`'${target}'`));
    }
    for (const status of PATH_VIDEO_RULE_STATUSES) {
      assert.match(source, new RegExp(`'${status}'`));
    }
    assert.match(source, /operator = 'equals'/);
    assert.match(source, /action = 'exclude'/);
    assert.match(source, /path_video_rules_rule_key_version_unique/);
    assert.match(source, /path_video_rules_one_active_per_rule_key/);
    assert.match(source, /WHERE status = 'active'/);
    assert.match(source, /path_video_rules_activation_provenance/);
    assert.match(source, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      source,
      /GRANT ALL ON TABLE public\.path_video_rules TO service_role/
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.path_video_rules FROM anon/
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.path_video_rules FROM authenticated/
    );
    assert.doesNotMatch(source, /DELETE FROM|DROP TABLE/i);
  });
});

describe('hand-maintained supabase types include path_video_rules', () => {
  it('declares Row Insert Update for path_video_rules', () => {
    const source = readFileSync(supabaseTypesPath, 'utf8');
    assert.match(source, /path_video_rules:\s*\{/);
    assert.match(source, /source_candidate_id: string/);
    assert.match(source, /activated_by: string \| null/);
    assert.match(source, /'draft' \| 'active' \| 'suspended' \| 'retired'/);
  });
});

describe('unauthorized users', () => {
  it('denies unauthenticated and non-reviewer callers via reviewer policy', () => {
    const unauth = evaluateApiReviewerAccess({
      userId: null,
      reviewerIdsEnv: REVIEWER_ID,
    });
    assert.equal(unauth.authorized, false);
    if (unauth.authorized) assert.fail('expected 401');
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.code, API_AUTH_ERROR_CODE.UNAUTHENTICATED);
    assert.equal(unauth.body.error, UNAUTHENTICATED_MESSAGE);

    const forbidden = evaluateApiReviewerAccess({
      userId: NON_REVIEWER_ID,
      reviewerIdsEnv: REVIEWER_ID,
    });
    assert.equal(forbidden.authorized, false);
    if (forbidden.authorized) assert.fail('expected 403');
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, API_AUTH_ERROR_CODE.REVIEWER_FORBIDDEN);
    assert.equal(forbidden.body.error, REVIEWER_FORBIDDEN_MESSAGE);
  });

  it('wires requireApiReviewerSession on list/create/status routes', () => {
    const listCreate = readFileSync(rulesRoutePath, 'utf8');
    const statusRoute = readFileSync(ruleIdRoutePath, 'utf8');
    assert.match(listCreate, /requireApiReviewerSession/);
    assert.match(statusRoute, /requireApiReviewerSession/);
    assert.doesNotMatch(listCreate, /requireApiSession\(\)/);
    assert.doesNotMatch(statusRoute, /requireApiSession\(\)/);
    assert.match(
      readFileSync(join(root, 'src/lib/api-auth.ts'), 'utf8'),
      new RegExp(SAVEDTUBE_REVIEWER_IDS_ENV_NAME)
    );
  });
});

describe('malformed and free-text predicates', () => {
  it('rejects unknown keys, free-text operators, and invalid enums/lengths', () => {
    const freeText = parsePathVideoRuleProposalBody({
      ...validProposal(),
      operator: 'matches_regex',
      predicate: 'title.contains("spam")',
    });
    assert.equal(freeText.success, false);

    const badTarget = parsePathVideoRuleProposalBody(
      validProposal({ targetType: 'channel_name' })
    );
    assert.equal(badTarget.success, false);

    const badAction = parsePathVideoRuleProposalBody(
      validProposal({ action: 'include' })
    );
    assert.equal(badAction.success, false);

    const badVideoValue = parsePathVideoRuleProposalBody(
      validProposal({ value: 'not-a-youtube-id' })
    );
    assert.equal(badVideoValue.success, false);

    const emptyReason = parsePathVideoRuleProposalBody(
      validProposal({ reason: '  ' })
    );
    assert.equal(emptyReason.success, false);

    const longKey = parsePathVideoRuleProposalBody(
      validProposal({ ruleKey: `a${'b'.repeat(200)}` })
    );
    assert.equal(longKey.success, false);

    const extra = parsePathVideoRuleProposalBody({
      ...validProposal(),
      expression: 'drop_all()',
    });
    assert.equal(extra.success, false);

    assert.deepEqual([...PATH_VIDEO_RULE_OPERATORS], ['equals']);
    assert.deepEqual([...PATH_VIDEO_RULE_ACTIONS], ['exclude']);
  });

  it('accepts a closed valid proposal', () => {
    const parsed = parsePathVideoRuleProposalBody(validProposal());
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.operator, 'equals');
    assert.equal(parsed.data.action, 'exclude');
    assert.equal(parsed.data.activate, false);
  });
});

describe('reviewer draft proposal', () => {
  it('creates a draft without activation provenance', async () => {
    const db = createRulesDb();
    const parsed = parsePathVideoRuleProposalBody(validProposal());
    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    const result = await proposePathVideoRule(
      db as never,
      REVIEWER_ID,
      parsed.data,
      {
        now: new Date(ACTIVATED_AT),
      }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rule.status, 'draft');
    assert.equal(result.rule.activatedBy, null);
    assert.equal(result.rule.activatedAt, null);
    assert.equal(result.rule.version, 1);
    assert.equal(result.activeForPathGeneration, false);
    assert.equal(db.candidates[0]!.status, 'approved');
  });
});

describe('reviewer activation', () => {
  it('activates only when activate=true and records activated_by', async () => {
    const db = createRulesDb();
    const parsed = parsePathVideoRuleProposalBody(
      validProposal({ activate: true })
    );
    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    const result = await proposePathVideoRule(
      db as never,
      REVIEWER_ID,
      parsed.data,
      {
        now: new Date(ACTIVATED_AT),
      }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rule.status, 'active');
    assert.equal(result.rule.activatedBy, REVIEWER_ID);
    assert.equal(result.rule.activatedAt, ACTIVATED_AT);
    assert.equal(result.activeForPathGeneration, true);
  });

  it('activates an existing draft via status transition with provenance', async () => {
    const draft: PathVideoRuleRecord = {
      id: VALID_RULE_ID,
      source_candidate_id: VALID_CANDIDATE_ID,
      rule_key: 'exclude-video-dqw4w9wgxcq',
      target_type: 'video',
      operator: 'equals',
      value: VALID_YOUTUBE_ID,
      action: 'exclude',
      reason: 'Low quality.',
      status: 'draft',
      version: 1,
      activated_by: null,
      activated_at: null,
      review_due_at: null,
      created_at: ACTIVATED_AT,
      updated_at: ACTIVATED_AT,
    };
    const db = createRulesDb({ existingRules: [draft] });
    const parsed = parsePathVideoRuleStatusUpdateBody({ status: 'active' });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    const result = await transitionPathVideoRuleStatus(
      db as never,
      REVIEWER_ID,
      VALID_RULE_ID,
      parsed.data,
      { now: new Date(ACTIVATED_AT) }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rule.status, 'active');
    assert.equal(result.rule.activatedBy, REVIEWER_ID);
    assert.equal(result.rule.activatedAt, ACTIVATED_AT);
    assert.equal(result.activeForPathGeneration, true);
  });

  it('never activates from model-approved candidate status alone', async () => {
    const db = createRulesDb({
      candidateStatus: 'approved',
      assessmentNotes: objectiveNotes(),
    });
    const parsed = parsePathVideoRuleProposalBody(
      validProposal({ activate: false })
    );
    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    const result = await proposePathVideoRule(
      db as never,
      REVIEWER_ID,
      parsed.data
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rule.status, 'draft');
    assert.equal(db.candidates[0]!.status, 'approved');
    assert.equal(result.rule.activatedBy, null);
  });
});

describe('subjective or suspicious candidate narrowing', () => {
  it('rejects activation and requires narrowToNonGlobalDraft for drafts', async () => {
    assert.equal(
      evaluateRestrictedCandidateRuleProposal({
        classification: 'subjective_preference',
        activate: true,
        narrowToNonGlobalDraft: false,
      }).ok,
      false
    );

    const db = createRulesDb({ assessmentNotes: subjectiveNotes() });
    const withoutNarrow = parsePathVideoRuleProposalBody(validProposal());
    assert.equal(withoutNarrow.success, true);
    if (!withoutNarrow.success) return;
    const rejected = await proposePathVideoRule(
      db as never,
      REVIEWER_ID,
      withoutNarrow.data
    );
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.equal(rejected.status, 400);

    const narrowed = parsePathVideoRuleProposalBody(
      validProposal({ narrowToNonGlobalDraft: true })
    );
    assert.equal(narrowed.success, true);
    if (!narrowed.success) return;
    const draft = await proposePathVideoRule(
      db as never,
      REVIEWER_ID,
      narrowed.data
    );
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    assert.equal(draft.rule.status, 'draft');

    const suspiciousDb = createRulesDb({ assessmentNotes: suspiciousNotes() });
    const activateAttempt = parsePathVideoRuleProposalBody(
      validProposal({ activate: true })
    );
    assert.equal(activateAttempt.success, true);
    if (!activateAttempt.success) return;
    const blocked = await proposePathVideoRule(
      suspiciousDb as never,
      REVIEWER_ID,
      activateAttempt.data
    );
    assert.equal(blocked.ok, false);
  });

  it('parses assessment classification from candidate notes', () => {
    assert.equal(
      extractCandidateAssessmentClassification(subjectiveNotes()),
      'subjective_preference'
    );
    assert.equal(
      extractCandidateAssessmentClassification(suspiciousNotes()),
      'suspicious_or_injection'
    );
    assert.equal(extractCandidateAssessmentClassification(null), null);
    assert.equal(extractCandidateAssessmentClassification('{bad'), null);
  });
});

describe('suspend and retire rollback', () => {
  it('suspends and retires without deletion', async () => {
    const active: PathVideoRuleRecord = {
      id: VALID_RULE_ID,
      source_candidate_id: VALID_CANDIDATE_ID,
      rule_key: 'exclude-video-dqw4w9wgxcq',
      target_type: 'video',
      operator: 'equals',
      value: VALID_YOUTUBE_ID,
      action: 'exclude',
      reason: 'Low quality.',
      status: 'active',
      version: 1,
      activated_by: REVIEWER_ID,
      activated_at: ACTIVATED_AT,
      review_due_at: null,
      created_at: ACTIVATED_AT,
      updated_at: ACTIVATED_AT,
    };
    const db = createRulesDb({ existingRules: [active] });

    const suspend = await transitionPathVideoRuleStatus(
      db as never,
      REVIEWER_ID,
      VALID_RULE_ID,
      { status: 'suspended' }
    );
    assert.equal(suspend.ok, true);
    if (!suspend.ok) return;
    assert.equal(suspend.rule.status, 'suspended');
    assert.equal(db.rules.length, 1);
    assert.equal(db.rules[0]!.activated_by, REVIEWER_ID);

    const retire = await transitionPathVideoRuleStatus(
      db as never,
      REVIEWER_ID,
      VALID_RULE_ID,
      { status: 'retired' }
    );
    assert.equal(retire.ok, true);
    if (!retire.ok) return;
    assert.equal(retire.rule.status, 'retired');
    assert.equal(db.rules.length, 1);

    const revive = await transitionPathVideoRuleStatus(
      db as never,
      REVIEWER_ID,
      VALID_RULE_ID,
      { status: 'active' }
    );
    assert.equal(revive.ok, false);
    if (revive.ok) return;
    assert.equal(revive.status, 400);
  });
});

describe('provenance and listing', () => {
  it('preserves source_candidate_id and lists rules', async () => {
    const db = createRulesDb();
    const parsed = parsePathVideoRuleProposalBody(validProposal());
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    const created = await proposePathVideoRule(
      db as never,
      REVIEWER_ID,
      parsed.data
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.rule.sourceCandidateId, VALID_CANDIDATE_ID);

    const listed = await listPathVideoRules(db as never);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.rules.length, 1);
    assert.deepEqual(listed.rules[0], toPathVideoRulePublic(db.rules[0]!));
  });
});

describe('invariant: soft-dismiss filter remains unwired; active rules qualify for research', () => {
  it('qualifies only active status for path generation', () => {
    assert.equal(isPathVideoRuleActiveForPathGeneration('active'), true);
    assert.equal(isPathVideoRuleActiveForPathGeneration('draft'), false);
    assert.equal(isPathVideoRuleActiveForPathGeneration('suspended'), false);
    assert.equal(isPathVideoRuleActiveForPathGeneration('retired'), false);
  });

  it('does not wire path_video_rules into soft-dismiss filter or assessment', () => {
    const filter = readFileSync(filterSourcePath, 'utf8');
    const research = readFileSync(researchServicePath, 'utf8');
    const assessment = readFileSync(assessmentSourcePath, 'utf8');
    const rulesLib = readFileSync(
      join(root, 'src/lib/path-video-rules.ts'),
      'utf8'
    );

    assert.doesNotMatch(filter, /path_video_rules|path-video-rules/);
    assert.doesNotMatch(assessment, /path_video_rules|proposePathVideoRule/);
    assert.match(research, /path-video-rule-research/);
    assert.equal(isPathVideoRuleActiveForPathGeneration('active'), true);

    for (const surface of PATH_VIDEO_RULE_UNTOUCHED_GENERATION_SURFACES) {
      assert.doesNotMatch(
        rulesLib,
        new RegExp(`from ['"]\\.\\/${surface}`),
        `rules lib must not import ${surface}`
      );
    }
  });
});
