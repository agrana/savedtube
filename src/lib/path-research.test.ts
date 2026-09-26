import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  parseResearchPlan,
  parseResearchRequestBody,
  parseResearchSelection,
  validateSelectionAgainstCandidates,
  type PathJobRecord,
  type ResearchCandidate,
  type ResearchPlan,
  type ResearchSelection,
} from './path-research-schema.ts';
import {
  assertJobMayPersist,
  buildPersistedRevision,
  claimResearchJob,
  runPathResearch,
  type ResearchDeps,
  type ResearchLlmProvider,
  type ResearchSettings,
  type YouTubeClient,
} from './path-research-service.ts';
import { derivePathTitle, type PathRecord } from './paths.ts';
import {
  RESEARCH_DEFAULT_MAX_DURATION_SECONDS,
  RESEARCH_MAX_STAGES,
  RESEARCH_MAX_VIDEOS_PER_STAGE,
} from './config-research-defaults.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

type GenerationUsageRow = {
  scope_type: 'user' | 'project';
  scope_key: string;
  period_start: string;
  reserved_units: number;
  consumed_units: number;
};

type PathStageRow = {
  id: string;
  revision_id: string;
  position: number;
  title: string;
  learning_objective: string;
  reason: string;
  created_at: string;
  updated_at: string;
};

type PathVideoRow = {
  id: string;
  stage_id: string;
  position: number;
  youtube_video_id: string;
  title: string;
  channel_title: string | null;
  selection_reason: string;
  source: 'research' | 'manual';
  duration_seconds: number | null;
  thumbnail_url: string | null;
  verified_at: string;
  metadata_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type PathRevisionRow = {
  id: string;
  path_id: string;
  revision_number: number;
  status: 'draft' | 'active' | 'archived';
  edit_version: number;
  input_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function makeSettings(
  overrides: Partial<ResearchSettings> = {}
): ResearchSettings {
  return {
    enabled: true,
    maxDurationSeconds: RESEARCH_DEFAULT_MAX_DURATION_SECONDS,
    requestDeadlineMs: 60_000,
    providerTimeoutMs: 5_000,
    youtubeTimeoutMs: 5_000,
    modelProvider: 'fake',
    modelName: 'fake-model',
    userDailyBudget: 10,
    projectDailyBudget: 100,
    candidatesPerStage: 5,
    maxStages: RESEARCH_MAX_STAGES,
    maxVideosPerStage: RESEARCH_MAX_VIDEOS_PER_STAGE,
    promptVersion: 'test-prompt',
    schemaVersion: 'test-schema',
    ...overrides,
  };
}

function makePath(
  overrides: Partial<PathRecord> & Pick<PathRecord, 'id' | 'owner' | 'goal'>
): PathRecord {
  return {
    background: null,
    title: derivePathTitle(overrides.goal, overrides.title),
    active_revision_id: null,
    created_at: '2026-09-26T12:00:00.000Z',
    updated_at: '2026-09-26T12:00:00.000Z',
    ...overrides,
  };
}

function candidate(id: string, title = `Video ${id}`): ResearchCandidate {
  return {
    youtubeVideoId: id,
    title,
    channelTitle: 'Channel',
    durationSeconds: 120,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    descriptionExcerpt: 'Untrusted description text',
  };
}

function defaultPlan(): ResearchPlan {
  return {
    stages: [
      {
        title: 'Basics',
        learningObjective: 'Learn the basics',
        reason: 'Start simple',
        searchQuery: 'kubernetes basics',
      },
      {
        title: 'Practice',
        learningObjective: 'Apply knowledge',
        reason: 'Hands on',
        searchQuery: 'kubernetes practice',
      },
    ],
  };
}

function createFakeLlm(handlers: {
  planStages?: ResearchLlmProvider['planStages'];
  selectVideos?: ResearchLlmProvider['selectVideos'];
}): ResearchLlmProvider {
  return {
    provider: 'fake',
    model: 'fake-model',
    planStages:
      handlers.planStages ||
      (async () => ({
        ok: true,
        data: defaultPlan(),
        latencyMs: 1,
        usage: { totalTokens: 10 },
      })),
    selectVideos:
      handlers.selectVideos ||
      (async (input) => {
        const stages: ResearchSelection['stages'] = [];
        for (const [stageIndex, candidates] of input.candidatesByStage) {
          if (candidates.length === 0) {
            continue;
          }
          stages.push({
            stageIndex,
            videoIds: [candidates[0].youtubeVideoId],
            reasons: ['Relevant verified candidate'],
          });
        }
        return {
          ok: true,
          data: { stages },
          latencyMs: 1,
          usage: { totalTokens: 8 },
        };
      }),
  };
}

function createFakeYouTube(handlers?: {
  search?: YouTubeClient['searchEmbeddableVideos'];
  details?: YouTubeClient['fetchVideoDetails'];
  catalog?: Map<string, ResearchCandidate[]>;
}): YouTubeClient {
  const catalog =
    handlers?.catalog ||
    new Map<string, ResearchCandidate[]>([
      [
        'kubernetes basics',
        [candidate('aaaaaaaaaaa'), candidate('bbbbbbbbbbb')],
      ],
      [
        'kubernetes practice',
        [candidate('ccccccccccc'), candidate('ddddddddddd')],
      ],
    ]);

  return {
    searchEmbeddableVideos:
      handlers?.search ||
      (async ({ query }) => {
        const found = catalog.get(query) || [];
        return { ok: true, videoIds: found.map((item) => item.youtubeVideoId) };
      }),
    fetchVideoDetails:
      handlers?.details ||
      (async ({ videoIds }) => {
        const all = [...catalog.values()].flat();
        const byId = new Map(all.map((item) => [item.youtubeVideoId, item]));
        return {
          ok: true,
          candidates: videoIds
            .map((id) => byId.get(id))
            .filter((item): item is ResearchCandidate => Boolean(item)),
        };
      }),
  };
}

/** In-memory Supabase surface for research jobs, budgets, and revision persistence. */
function createMemoryResearchDb(initialPaths: PathRecord[] = []) {
  const paths = initialPaths.map((path) => ({ ...path }));
  const jobs: PathJobRecord[] = [];
  const revisions: PathRevisionRow[] = [];
  const stages: PathStageRow[] = [];
  const videos: PathVideoRow[] = [];
  const usage: GenerationUsageRow[] = [];
  const today = '2026-09-26';

  function ensureUsage(scopeType: 'user' | 'project', scopeKey: string) {
    let row = usage.find(
      (item) =>
        item.scope_type === scopeType &&
        item.scope_key === scopeKey &&
        item.period_start === today
    );
    if (!row) {
      row = {
        scope_type: scopeType,
        scope_key: scopeKey,
        period_start: today,
        reserved_units: 0,
        consumed_units: 0,
      };
      usage.push(row);
    }
    return row;
  }

  function matches(
    row: Record<string, unknown>,
    filters: Array<{ column: string; value: unknown; mode: 'eq' | 'in' }>
  ) {
    return filters.every((filter) => {
      if (filter.mode === 'eq') {
        return row[filter.column] === filter.value;
      }
      return (filter.value as unknown[]).includes(row[filter.column]);
    });
  }

  function tableRows(table: string): Record<string, unknown>[] {
    switch (table) {
      case 'paths':
        return paths as unknown as Record<string, unknown>[];
      case 'path_jobs':
        return jobs as unknown as Record<string, unknown>[];
      case 'path_revisions':
        return revisions as unknown as Record<string, unknown>[];
      case 'path_stages':
        return stages as unknown as Record<string, unknown>[];
      case 'path_videos':
        return videos as unknown as Record<string, unknown>[];
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  }

  function from(table: string) {
    const state: {
      filters: Array<{ column: string; value: unknown; mode: 'eq' | 'in' }>;
      orderColumn?: string;
      ascending: boolean;
      limitCount?: number;
      mode: 'select' | 'insert' | 'update';
      pendingInsert?: Record<string, unknown>;
      pendingUpdate?: Record<string, unknown>;
      wantSingle: boolean;
      wantMaybeSingle: boolean;
    } = {
      filters: [],
      ascending: true,
      mode: 'select',
      wantSingle: false,
      wantMaybeSingle: false,
    };

    const resolveSelect = () => {
      let rows = tableRows(table).filter((row) => matches(row, state.filters));
      if (state.orderColumn) {
        const column = state.orderColumn;
        rows = [...rows].sort((a, b) => {
          const left = a[column];
          const right = b[column];
          if (left === right) {
            return 0;
          }
          if (left == null) {
            return state.ascending ? -1 : 1;
          }
          if (right == null) {
            return state.ascending ? 1 : -1;
          }
          if (left < right) {
            return state.ascending ? -1 : 1;
          }
          return state.ascending ? 1 : -1;
        });
      }
      if (state.limitCount !== undefined) {
        rows = rows.slice(0, state.limitCount);
      }
      return rows;
    };

    const finish = async () => {
      if (state.mode === 'insert') {
        const payload = { ...(state.pendingInsert || {}) };
        if (table === 'path_jobs') {
          const owner = String(payload.owner);
          const idempotencyKey = String(payload.idempotency_key);
          if (
            jobs.some(
              (job) =>
                job.owner === owner && job.idempotency_key === idempotencyKey
            )
          ) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate idempotency' },
            };
          }
          if (
            payload.kind === 'research' &&
            ['queued', 'running'].includes(String(payload.status)) &&
            jobs.some(
              (job) =>
                job.path_id === payload.path_id &&
                job.kind === 'research' &&
                (job.status === 'queued' || job.status === 'running')
            )
          ) {
            return {
              data: null,
              error: { code: '23505', message: 'active research exists' },
            };
          }

          const now = new Date().toISOString();
          const row: PathJobRecord = {
            id: randomUUID(),
            owner,
            path_id: String(payload.path_id),
            revision_id: (payload.revision_id as string | null) ?? null,
            kind: 'research',
            idempotency_key: idempotencyKey,
            status: payload.status as PathJobRecord['status'],
            phase: payload.phase as PathJobRecord['phase'],
            attempt: Number(payload.attempt || 1),
            deadline_at: String(payload.deadline_at),
            input_snapshot: (payload.input_snapshot || {}) as Record<
              string,
              unknown
            >,
            prompt_version: (payload.prompt_version as string | null) ?? null,
            schema_version: (payload.schema_version as string | null) ?? null,
            model_provider: (payload.model_provider as string | null) ?? null,
            model_name: (payload.model_name as string | null) ?? null,
            result: (payload.result as Record<string, unknown> | null) ?? null,
            error: (payload.error as Record<string, unknown> | null) ?? null,
            usage: (payload.usage as Record<string, unknown> | null) ?? null,
            started_at: (payload.started_at as string | null) ?? null,
            finished_at: (payload.finished_at as string | null) ?? null,
            created_at: now,
            updated_at: now,
          };
          jobs.push(row);
          if (state.wantSingle) {
            return { data: row, error: null };
          }
          return { data: [row], error: null };
        }
        throw new Error(`insert not supported for ${table}`);
      }

      if (state.mode === 'update') {
        const rows = resolveSelect();
        const updated = rows.map((row) => {
          Object.assign(row, state.pendingUpdate, {
            updated_at: new Date().toISOString(),
          });
          return row;
        });
        if (state.wantMaybeSingle || state.wantSingle) {
          return { data: updated[0] || null, error: null };
        }
        return { data: updated, error: null };
      }

      const rows = resolveSelect();
      if (state.wantMaybeSingle || state.wantSingle) {
        return { data: rows[0] || null, error: null };
      }
      return { data: rows, error: null };
    };

    const builder = {
      select() {
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.mode = 'insert';
        state.pendingInsert = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.mode = 'update';
        state.pendingUpdate = payload;
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, value, mode: 'eq' });
        return builder;
      },
      in(column: string, value: unknown[]) {
        state.filters.push({ column, value, mode: 'in' });
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        state.orderColumn = column;
        state.ascending = options.ascending;
        return builder;
      },
      limit(count: number) {
        state.limitCount = count;
        return builder;
      },
      single() {
        state.wantSingle = true;
        return finish();
      },
      maybeSingle() {
        state.wantMaybeSingle = true;
        return finish();
      },
      then(
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        return finish().then(resolve, reject);
      },
    };

    return builder;
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === 'reserve_generation_budget') {
      const owner = String(args.p_owner);
      const userLimit = Number(args.p_user_limit);
      const projectLimit = Number(args.p_project_limit);
      const units = Number(args.p_units || 1);
      const projectKey = String(args.p_project_key || 'project');
      const userRow = ensureUsage('user', owner);
      const projectRow = ensureUsage('project', projectKey);
      if (userRow.reserved_units + units > userLimit) {
        return {
          data: {
            ok: false,
            code: 'user_budget_exhausted',
            period_start: today,
          },
          error: null,
        };
      }
      if (projectRow.reserved_units + units > projectLimit) {
        return {
          data: {
            ok: false,
            code: 'project_budget_exhausted',
            period_start: today,
          },
          error: null,
        };
      }
      userRow.reserved_units += units;
      projectRow.reserved_units += units;
      return {
        data: {
          ok: true,
          period_start: today,
          units,
          user_reserved: userRow.reserved_units,
          project_reserved: projectRow.reserved_units,
        },
        error: null,
      };
    }

    if (name === 'consume_generation_budget') {
      const owner = String(args.p_owner);
      const units = Number(args.p_units || 1);
      const projectKey = String(args.p_project_key || 'project');
      const userRow = ensureUsage('user', owner);
      const projectRow = ensureUsage('project', projectKey);
      userRow.consumed_units = Math.min(
        userRow.reserved_units,
        userRow.consumed_units + units
      );
      projectRow.consumed_units = Math.min(
        projectRow.reserved_units,
        projectRow.consumed_units + units
      );
      return { data: { ok: true, period_start: today, units }, error: null };
    }

    if (name === 'release_generation_budget') {
      const owner = String(args.p_owner);
      const units = Number(args.p_units || 1);
      const projectKey = String(args.p_project_key || 'project');
      const userRow = ensureUsage('user', owner);
      const projectRow = ensureUsage('project', projectKey);
      userRow.reserved_units = Math.max(
        userRow.consumed_units,
        userRow.reserved_units - units
      );
      projectRow.reserved_units = Math.max(
        projectRow.consumed_units,
        projectRow.reserved_units - units
      );
      return { data: { ok: true, period_start: today, units }, error: null };
    }

    if (name === 'save_complete_path_revision') {
      const pathId = String(args.p_path_id);
      const owner = String(args.p_owner);
      const path = paths.find((row) => row.id === pathId);
      if (!path || path.owner !== owner) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const stagePayload = args.p_stages as Array<{
        title: string;
        learningObjective: string;
        reason: string;
        videos: Array<{
          youtubeVideoId: string;
          title: string;
          channelTitle?: string | null;
          selectionReason: string;
          source?: string;
          durationSeconds?: number | null;
          thumbnailUrl?: string | null;
          verifiedAt: string;
          metadataSnapshot?: Record<string, unknown> | null;
        }>;
      }>;
      if (!Array.isArray(stagePayload) || stagePayload.length < 1) {
        return { data: { ok: false, code: 'invalid_stages' }, error: null };
      }

      // Match SQL: regeneration (active exists or p_as_draft) saves draft and
      // leaves the live revision + progress intact.
      const asDraft =
        Boolean(args.p_as_draft) || Boolean(path.active_revision_id);
      const status: 'draft' | 'active' = asDraft ? 'draft' : 'active';

      if (asDraft) {
        for (const row of revisions) {
          if (row.path_id === pathId && row.status === 'draft') {
            row.status = 'archived';
          }
        }
      } else if (path.active_revision_id) {
        const previous = revisions.find(
          (row) => row.id === path.active_revision_id
        );
        if (previous) {
          previous.status = 'archived';
        }
      }

      const revisionNumber =
        Math.max(
          0,
          ...revisions
            .filter((r) => r.path_id === pathId)
            .map((r) => r.revision_number)
        ) + 1;
      const now = new Date().toISOString();
      const revisionId = randomUUID();
      revisions.push({
        id: revisionId,
        path_id: pathId,
        revision_number: revisionNumber,
        status,
        edit_version: 1,
        input_snapshot: (args.p_input_snapshot || {}) as Record<
          string,
          unknown
        >,
        created_at: now,
        updated_at: now,
      });

      stagePayload.forEach((stage, stageIndex) => {
        const stageId = randomUUID();
        stages.push({
          id: stageId,
          revision_id: revisionId,
          position: stageIndex,
          title: stage.title,
          learning_objective: stage.learningObjective,
          reason: stage.reason,
          created_at: now,
          updated_at: now,
        });
        stage.videos.forEach((video, videoIndex) => {
          videos.push({
            id: randomUUID(),
            stage_id: stageId,
            position: videoIndex,
            youtube_video_id: video.youtubeVideoId,
            title: video.title,
            channel_title: video.channelTitle ?? null,
            selection_reason: video.selectionReason,
            source: 'research',
            duration_seconds: video.durationSeconds ?? null,
            thumbnail_url: video.thumbnailUrl ?? null,
            verified_at: video.verifiedAt,
            metadata_snapshot: video.metadataSnapshot ?? null,
            created_at: now,
            updated_at: now,
          });
        });
      });

      if (status === 'active') {
        path.active_revision_id = revisionId;
      }
      path.updated_at = now;

      return {
        data: {
          ok: true,
          revision_id: revisionId,
          revision_number: revisionNumber,
          status,
        },
        error: null,
      };
    }

    throw new Error(`Unexpected rpc ${name}`);
  }

  return {
    from,
    rpc,
    paths,
    jobs,
    revisions,
    stages,
    videos,
    usage,
  };
}

function makeDeps(args: {
  db: ReturnType<typeof createMemoryResearchDb>;
  llm?: ResearchLlmProvider;
  youtube?: YouTubeClient;
  settings?: Partial<ResearchSettings>;
  now?: () => Date;
}): ResearchDeps {
  return {
    db: args.db as never,
    llm: args.llm || createFakeLlm({}),
    youtube: args.youtube || createFakeYouTube(),
    researchConfig: makeSettings(args.settings),
    now: args.now,
  };
}

describe('path research schema validation', () => {
  it('accepts idempotency keys and rejects short ones', () => {
    const ok = parseResearchRequestBody({
      idempotencyKey: '12345678',
    });
    assert.equal(ok.success, true);

    const bad = parseResearchRequestBody({ idempotencyKey: 'short' });
    assert.equal(bad.success, false);
  });

  it('parses bounded plan and selection payloads', () => {
    const plan = parseResearchPlan(defaultPlan());
    assert.equal(plan.success, true);

    const selection = parseResearchSelection({
      stages: [
        {
          stageIndex: 0,
          videoIds: ['aaaaaaaaaaa'],
          reasons: ['Good intro'],
        },
      ],
    });
    assert.equal(selection.success, true);
  });
});

describe('candidate ID rejection', () => {
  it('rejects invented video IDs outside the verified pool', () => {
    const candidatesByStage = new Map<number, ResearchCandidate[]>([
      [0, [candidate('aaaaaaaaaaa')]],
    ]);
    const result = validateSelectionAgainstCandidates(
      {
        stages: [
          {
            stageIndex: 0,
            videoIds: ['zzzzzzzzzzz'],
            reasons: ['Invented'],
          },
        ],
      },
      candidatesByStage,
      RESEARCH_MAX_STAGES,
      RESEARCH_MAX_VIDEOS_PER_STAGE
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /not in the verified candidate pool/);
    }
  });

  it('rejects duplicates and mismatched reason counts', () => {
    const candidatesByStage = new Map<number, ResearchCandidate[]>([
      [0, [candidate('aaaaaaaaaaa'), candidate('bbbbbbbbbbb')]],
    ]);
    const dup = validateSelectionAgainstCandidates(
      {
        stages: [
          {
            stageIndex: 0,
            videoIds: ['aaaaaaaaaaa', 'aaaaaaaaaaa'],
            reasons: ['One', 'Two'],
          },
        ],
      },
      candidatesByStage,
      RESEARCH_MAX_STAGES,
      RESEARCH_MAX_VIDEOS_PER_STAGE
    );
    assert.equal(dup.ok, false);

    const mismatch = validateSelectionAgainstCandidates(
      {
        stages: [
          {
            stageIndex: 0,
            videoIds: ['aaaaaaaaaaa'],
            reasons: ['One', 'Two'],
          },
        ],
      },
      candidatesByStage,
      RESEARCH_MAX_STAGES,
      RESEARCH_MAX_VIDEOS_PER_STAGE
    );
    assert.equal(mismatch.ok, false);
  });

  it('buildPersistedRevision refuses candidates missing from the pool', () => {
    const built = buildPersistedRevision({
      plan: defaultPlan(),
      selectionStages: [
        {
          stageIndex: 0,
          videoIds: ['zzzzzzzzzzz'],
          reasons: ['Nope'],
        },
      ],
      candidatesByStage: new Map([[0, [candidate('aaaaaaaaaaa')]]]),
      verifiedAt: '2026-09-26T12:00:00.000Z',
    });
    assert.equal(built, null);
  });
});

describe('ownership', () => {
  it('blocks research on foreign-owned paths', async () => {
    const path = makePath({
      id: '11111111-1111-4111-8111-111111111111',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const result = await runPathResearch({
      deps: makeDeps({ db }),
      ownerId: 'user-b',
      pathId: path.id,
      idempotencyKey: 'foreign-owner-key-1',
      accessToken: 'token',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
    }
    assert.equal(db.jobs.length, 0);
    assert.equal(db.usage.length, 0);
  });
});

describe('idempotency and budgets', () => {
  it('reuses the same idempotency key without a second reservation', async () => {
    const path = makePath({
      id: '22222222-2222-4222-8222-222222222222',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const deps = makeDeps({ db });

    const first = await runPathResearch({
      deps,
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'same-key-abcdefgh',
      accessToken: 'token',
    });
    assert.equal(first.ok, true);
    assert.equal(db.jobs.length, 1);
    assert.equal(db.usage[0]?.reserved_units, 1);
    assert.equal(db.usage[0]?.consumed_units, 1);

    const second = await runPathResearch({
      deps,
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'same-key-abcdefgh',
      accessToken: 'token',
    });
    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.reused, true);
      assert.equal(second.job.id, db.jobs[0]?.id);
    }
    assert.equal(db.jobs.length, 1);
    assert.equal(db.usage[0]?.reserved_units, 1);
    assert.equal(db.usage[0]?.consumed_units, 1);
  });

  it('rejects a second active research with a different key without billing twice', async () => {
    const path = makePath({
      id: '33333333-3333-4333-8333-333333333333',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const settings = makeSettings();
    const llm = createFakeLlm({});

    const first = await claimResearchJob({
      db: db as never,
      ownerId: 'user-a',
      path,
      idempotencyKey: 'active-key-aaaaaaa',
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      settings,
      llm,
    });
    assert.equal(first.ok, true);
    assert.equal(db.usage[0]?.reserved_units, 1);

    const second = await claimResearchJob({
      db: db as never,
      ownerId: 'user-a',
      path,
      idempotencyKey: 'active-key-bbbbbbb',
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      settings,
      llm,
    });
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.status, 409);
      assert.equal(second.code, 'research_in_progress');
    }
    assert.equal(db.jobs.length, 1);
    assert.equal(db.usage[0]?.reserved_units, 1);
  });

  it('returns 429 when the daily user budget is exhausted', async () => {
    const path = makePath({
      id: '44444444-4444-4444-8444-444444444444',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const result = await runPathResearch({
      deps: makeDeps({
        db,
        settings: { userDailyBudget: 0 },
      }),
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'budget-key-aaaaaaa',
      accessToken: 'token',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 429);
      assert.equal(result.code, 'user_budget_exhausted');
    }
    assert.equal(db.jobs.length, 0);
  });
});

describe('timeout, quota, and provider failure', () => {
  it('marks the job interrupted on model timeout', async () => {
    const path = makePath({
      id: '55555555-5555-4555-8555-555555555555',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const result = await runPathResearch({
      deps: makeDeps({
        db,
        llm: createFakeLlm({
          planStages: async () => ({
            ok: false,
            code: 'model_timeout',
            message: 'Model call timed out',
            latencyMs: 5,
          }),
        }),
      }),
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'timeout-key-aaaaaa',
      accessToken: 'token',
    });
    assert.equal(result.ok, false);
    assert.equal(db.jobs[0]?.status, 'interrupted');
    assert.equal(db.jobs[0]?.error?.code, 'model_timeout');
    assert.equal(path.active_revision_id ?? null, null);
    assert.equal(db.revisions.length, 0);
  });

  it('surfaces YouTube quota failures without inventing videos', async () => {
    const path = makePath({
      id: '66666666-6666-4666-8666-666666666666',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const result = await runPathResearch({
      deps: makeDeps({
        db,
        youtube: createFakeYouTube({
          search: async () => ({
            ok: false,
            code: 'youtube_quota',
            message: 'YouTube search quota exceeded. Try again later.',
            status: 403,
          }),
        }),
      }),
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'quota-key-aaaaaaaa',
      accessToken: 'token',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'youtube_quota');
    }
    assert.equal(db.jobs[0]?.status, 'failed');
    assert.equal(db.revisions.length, 0);
  });

  it('fails closed when selection invents an ID', async () => {
    const path = makePath({
      id: '77777777-7777-4777-8777-777777777777',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const result = await runPathResearch({
      deps: makeDeps({
        db,
        llm: createFakeLlm({
          selectVideos: async () => ({
            ok: true,
            data: {
              stages: [
                {
                  stageIndex: 0,
                  videoIds: ['zzzzzzzzzzz'],
                  reasons: ['Invented'],
                },
              ],
            },
            latencyMs: 1,
          }),
        }),
      }),
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'invent-key-aaaaaaa',
      accessToken: 'token',
    });
    assert.equal(result.ok, false);
    assert.equal(db.jobs[0]?.error?.code, 'invalid_selection');
    assert.equal(db.revisions.length, 0);
  });

  it('refuses late persistence after the deadline', () => {
    const job = {
      status: 'running',
      deadline_at: '2026-09-26T12:00:00.000Z',
    } as Pick<PathJobRecord, 'status' | 'deadline_at'>;
    const late = assertJobMayPersist(
      job as PathJobRecord,
      new Date('2026-09-26T12:00:01.000Z')
    );
    assert.equal(late.ok, false);
    if (!late.ok) {
      assert.equal(late.code, 'deadline_exceeded');
    }
  });
});

describe('transactional persistence', () => {
  it('saves a complete active revision from verified candidates only', async () => {
    const path = makePath({
      id: '88888888-8888-4888-8888-888888888888',
      owner: 'user-a',
      goal: 'Pass the CKA',
      background: 'I know Linux',
    });
    const db = createMemoryResearchDb([path]);
    const result = await runPathResearch({
      deps: makeDeps({ db }),
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'persist-key-aaaaaa',
      accessToken: 'token',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.job.status, 'succeeded');
      assert.ok(result.revisionId);
    }
    assert.equal(db.revisions.length, 1);
    assert.equal(db.revisions[0]?.status, 'active');
    assert.equal(db.paths[0]?.active_revision_id, db.revisions[0]?.id);
    assert.equal(db.stages.length, 2);
    assert.equal(db.videos.length, 2);
    for (const video of db.videos) {
      assert.match(video.youtube_video_id, /^[a-zA-Z0-9_-]{11}$/);
    }
  });

  it('keeps the saved path readable when research fails', async () => {
    const path = makePath({
      id: '99999999-9999-4999-8999-999999999999',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    await runPathResearch({
      deps: makeDeps({
        db,
        llm: createFakeLlm({
          planStages: async () => ({
            ok: false,
            code: 'model_call_failed',
            message: 'Model call failed',
            latencyMs: 2,
          }),
        }),
      }),
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'keep-path-key-aaaa',
      accessToken: 'token',
    });

    assert.equal(db.paths[0]?.goal, 'Pass the CKA');
    assert.equal(db.paths[0]?.active_revision_id ?? null, null);
    assert.equal(db.revisions.length, 0);
    assert.equal(db.jobs[0]?.status, 'failed');
  });

  it('regeneration saves a draft and leaves the active revision intact', async () => {
    const path = makePath({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      owner: 'user-a',
      goal: 'Pass the CKA',
    });
    const db = createMemoryResearchDb([path]);
    const deps = makeDeps({ db });

    const first = await runPathResearch({
      deps,
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'regen-first-aaaaaaa',
      accessToken: 'token',
    });
    assert.equal(first.ok, true);
    const activeId = db.paths[0]?.active_revision_id;
    assert.ok(activeId);
    assert.equal(db.revisions[0]?.status, 'active');

    const second = await runPathResearch({
      deps,
      ownerId: 'user-a',
      pathId: path.id,
      idempotencyKey: 'regen-second-bbbbbb',
      accessToken: 'token',
    });
    assert.equal(second.ok, true);
    assert.equal(db.paths[0]?.active_revision_id, activeId);
    assert.equal(
      db.revisions.find((row) => row.id === activeId)?.status,
      'active'
    );
    const draft = db.revisions.find((row) => row.status === 'draft');
    assert.ok(draft);
    assert.notEqual(draft.id, activeId);
    if (second.ok) {
      assert.equal(second.revisionId, draft.id);
    }
  });
});

describe('path research migration and route config', () => {
  it('creates research tables with deny-by-default RLS and budget RPCs', () => {
    const source = readFileSync(
      join(root, 'supabase/migrations/20260926160000_create_path_research.sql'),
      'utf8'
    );
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.path_revisions/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.path_stages/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.path_videos/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.path_jobs/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.generation_usage/);
    assert.match(source, /active_revision_id/);
    assert.match(source, /reserve_generation_budget/);
    assert.match(source, /release_generation_budget/);
    assert.match(source, /save_complete_path_revision/);
    assert.match(source, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      source,
      /GRANT ALL ON TABLE public\.path_jobs TO service_role/
    );
    assert.doesNotMatch(source, /video_intervals.*REFERENCES public\.paths/);
  });

  it('keeps research route maxDuration aligned with the default config constant', () => {
    const route = readFileSync(
      join(root, 'src/app/api/paths/[pathId]/research/route.ts'),
      'utf8'
    );
    assert.match(
      route,
      new RegExp(
        `export const maxDuration = ${RESEARCH_DEFAULT_MAX_DURATION_SECONDS}`
      )
    );
    assert.match(route, /await the work|runPathResearch/i);
  });
});
