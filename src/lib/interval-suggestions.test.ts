import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  acceptOwnedIntervalSuggestions,
  generateOwnedIntervalSuggestions,
  rejectInventedTimestamps,
  selectKnownChapterSpans,
  type IntervalSuggestionDeps,
  type IntervalSuggestionRecord,
} from './interval-suggestions.ts';
import { extractChaptersFromDescription } from './youtube-chapters.ts';
import type { PathRecord } from './paths.ts';
import { derivePathTitle } from './paths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const OWNER = 'user-a';
const PATH_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '22222222-2222-4222-8222-222222222222';
const STAGE_A = '33333333-3333-4333-8333-333333333333';
const VIDEO_A1 = '55555555-5555-4555-8555-555555555555';
const YOUTUBE_ID = 'aaaaaaaaaaa';

function makePath(): PathRecord {
  return {
    id: PATH_ID,
    owner: OWNER,
    goal: 'Throw consistent darts',
    background: null,
    title: derivePathTitle('Throw consistent darts'),
    active_revision_id: REVISION_ID,
    created_at: '2026-09-26T12:00:00.000Z',
    updated_at: '2026-09-26T12:00:00.000Z',
  };
}

type IntervalRow = {
  id: string;
  user_id: string;
  video_id: string;
  name: string | null;
  start_time: number;
  end_time: number;
  order_index: number;
  created_at: string;
  updated_at: string;
};

type SuggestionJob = {
  id: string;
  owner: string;
  path_id: string;
  revision_id: string | null;
  kind: 'interval_suggestions';
  idempotency_key: string;
  status: string;
  phase: string;
  attempt: number;
  deadline_at: string;
  input_snapshot: Record<string, unknown>;
  prompt_version: string | null;
  schema_version: string | null;
  model_provider: string | null;
  model_name: string | null;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

function createSuggestionDb(args?: {
  description?: string;
  durationSeconds?: number | null;
  rankIndexes?: number[];
  inventTimestamps?: boolean;
  modelFails?: boolean;
}) {
  const path = makePath();
  const paths = [path];
  const revisions = [
    {
      id: REVISION_ID,
      path_id: PATH_ID,
      revision_number: 1,
      status: 'active' as const,
      edit_version: 1,
      input_snapshot: {},
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    },
  ];
  const stages = [
    {
      id: STAGE_A,
      revision_id: REVISION_ID,
      position: 0,
      title: 'Stance',
      learning_objective: 'Build a repeatable stance',
      reason: 'Foundation',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    },
  ];
  const videos = [
    {
      id: VIDEO_A1,
      stage_id: STAGE_A,
      position: 0,
      youtube_video_id: YOUTUBE_ID,
      title: 'Dart stance basics',
      channel_title: 'Channel',
      selection_reason: 'Clear intro',
      source: 'research' as const,
      duration_seconds: args?.durationSeconds ?? 240,
      thumbnail_url: null,
      verified_at: '2026-09-26T12:00:00.000Z',
      metadata_snapshot: null,
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    },
  ];
  const jobs: SuggestionJob[] = [];
  const suggestions: IntervalSuggestionRecord[] = [];
  const intervals: IntervalRow[] = [];

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
      case 'path_revisions':
        return revisions as unknown as Record<string, unknown>[];
      case 'path_stages':
        return stages as unknown as Record<string, unknown>[];
      case 'path_videos':
        return videos as unknown as Record<string, unknown>[];
      case 'path_jobs':
        return jobs as unknown as Record<string, unknown>[];
      case 'interval_suggestions':
        return suggestions as unknown as Record<string, unknown>[];
      case 'video_intervals':
        return intervals as unknown as Record<string, unknown>[];
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  }

  function from(table: string) {
    const state: {
      filters: Array<{ column: string; value: unknown; mode: 'eq' | 'in' }>;
      orderColumn?: string;
      ascending: boolean;
      mode: 'select' | 'insert' | 'update' | 'delete';
      pendingInsert?: Record<string, unknown> | Record<string, unknown>[];
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
          if (left === right) return 0;
          if (left == null) return state.ascending ? -1 : 1;
          if (right == null) return state.ascending ? 1 : -1;
          if (left < right) return state.ascending ? -1 : 1;
          return state.ascending ? 1 : -1;
        });
      }
      return rows;
    };

    const finish = async () => {
      if (state.mode === 'insert' && state.pendingInsert) {
        const payloads = Array.isArray(state.pendingInsert)
          ? state.pendingInsert
          : [state.pendingInsert];
        const created: Record<string, unknown>[] = [];
        for (const payload of payloads) {
          if (table === 'path_jobs') {
            const row: SuggestionJob = {
              id: randomUUID(),
              owner: String(payload.owner),
              path_id: String(payload.path_id),
              revision_id: (payload.revision_id as string | null) ?? null,
              kind: 'interval_suggestions',
              idempotency_key: String(payload.idempotency_key),
              status: String(payload.status),
              phase: String(payload.phase),
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
              result: null,
              error: null,
              usage: null,
              started_at: (payload.started_at as string | null) ?? null,
              finished_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            jobs.push(row);
            created.push(row as unknown as Record<string, unknown>);
          } else if (table === 'interval_suggestions') {
            const row: IntervalSuggestionRecord = {
              id: randomUUID(),
              owner: String(payload.owner),
              path_video_id: String(payload.path_video_id),
              path_job_id: String(payload.path_job_id),
              label: String(payload.label),
              start_time: Number(payload.start_time),
              end_time: Number(payload.end_time),
              rationale: String(payload.rationale),
              accepted_interval_id: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            suggestions.push(row);
            created.push(row as unknown as Record<string, unknown>);
          } else if (table === 'video_intervals') {
            const row: IntervalRow = {
              id: randomUUID(),
              user_id: String(payload.user_id),
              video_id: String(payload.video_id),
              name: (payload.name as string | null) ?? null,
              start_time: Number(payload.start_time),
              end_time: Number(payload.end_time),
              order_index: Number(payload.order_index || 0),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            intervals.push(row);
            created.push(row as unknown as Record<string, unknown>);
          }
        }
        if (state.wantSingle) {
          return { data: created[0] || null, error: null };
        }
        return { data: created, error: null };
      }

      if (state.mode === 'update' && state.pendingUpdate) {
        const rows = resolveSelect();
        for (const row of rows) {
          Object.assign(row, state.pendingUpdate, {
            updated_at: new Date().toISOString(),
          });
        }
        if (state.wantSingle) {
          return { data: rows[0] || null, error: null };
        }
        return { data: rows, error: null };
      }

      if (state.mode === 'delete') {
        const rows = resolveSelect();
        const store = tableRows(table);
        for (const row of rows) {
          const index = store.indexOf(row);
          if (index >= 0) store.splice(index, 1);
        }
        return { data: rows, error: null };
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
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        state.mode = 'insert';
        state.pendingInsert = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.mode = 'update';
        state.pendingUpdate = payload;
        return builder;
      },
      delete() {
        state.mode = 'delete';
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
      limit() {
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

  async function rpc(name: string, rpcArgs: Record<string, unknown>) {
    if (name === 'replace_owned_video_intervals') {
      const userId = String(rpcArgs.p_user_id);
      const videoId = String(rpcArgs.p_video_id);
      const payload = rpcArgs.p_intervals as Array<{
        name?: string | null;
        start_time: number;
        end_time: number;
        order_index: number;
      }>;
      for (let i = intervals.length - 1; i >= 0; i -= 1) {
        if (
          intervals[i]?.user_id === userId &&
          intervals[i]?.video_id === videoId
        ) {
          intervals.splice(i, 1);
        }
      }
      const inserted: IntervalRow[] = [];
      payload.forEach((item, index) => {
        const row: IntervalRow = {
          id: randomUUID(),
          user_id: userId,
          video_id: videoId,
          name: item.name ?? null,
          start_time: item.start_time,
          end_time: item.end_time,
          order_index: item.order_index ?? index,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        intervals.push(row);
        inserted.push(row);
      });
      return {
        data: {
          ok: true,
          intervals: inserted,
          imported_count: inserted.length,
        },
        error: null,
      };
    }

    if (name === 'accept_interval_suggestion') {
      const owner = String(rpcArgs.p_owner);
      const suggestionId = String(rpcArgs.p_suggestion_id);
      const youtubeVideoId = String(rpcArgs.p_youtube_video_id);
      const suggestion = suggestions.find(
        (row) => row.id === suggestionId && row.owner === owner
      );
      if (!suggestion) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }

      if (suggestion.accepted_interval_id) {
        const existing = intervals.find(
          (row) => row.id === suggestion.accepted_interval_id
        );
        if (existing) {
          return {
            data: {
              ok: true,
              created: false,
              suggestion_id: suggestion.id,
              interval: existing,
            },
            error: null,
          };
        }
      }

      const existing = intervals.find(
        (row) =>
          row.user_id === owner &&
          row.video_id === youtubeVideoId &&
          row.start_time === suggestion.start_time &&
          row.end_time === suggestion.end_time
      );
      if (existing) {
        suggestion.accepted_interval_id = existing.id;
        if (!existing.name) {
          existing.name = suggestion.label;
        }
        return {
          data: {
            ok: true,
            created: false,
            suggestion_id: suggestion.id,
            interval: existing,
          },
          error: null,
        };
      }

      const maxOrder = Math.max(
        -1,
        ...intervals
          .filter(
            (row) => row.user_id === owner && row.video_id === youtubeVideoId
          )
          .map((row) => row.order_index)
      );
      const created: IntervalRow = {
        id: randomUUID(),
        user_id: owner,
        video_id: youtubeVideoId,
        name: suggestion.label,
        start_time: suggestion.start_time,
        end_time: suggestion.end_time,
        order_index: maxOrder + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      intervals.push(created);
      suggestion.accepted_interval_id = created.id;
      return {
        data: {
          ok: true,
          created: true,
          suggestion_id: suggestion.id,
          interval: created,
        },
        error: null,
      };
    }

    throw new Error(`Unexpected rpc ${name}`);
  }

  const description =
    args?.description ??
    ['0:00 Opening stance', '1:15 Grip basics', '3:00 Follow through'].join(
      '\n'
    );

  const deps: IntervalSuggestionDeps = {
    db: { from, rpc },
    researchConfig: {
      enabled: true,
      requestDeadlineMs: 60_000,
      providerTimeoutMs: 10_000,
      youtubeTimeoutMs: 5_000,
      modelProvider: 'test',
      modelName: 'test-model',
      userDailyBudget: 10,
      projectDailyBudget: 100,
      promptVersion: 'interval-suggestions-rank-v1',
      schemaVersion: 'interval-suggestions-v1',
    },
    fetchDescription: async () => ({
      ok: true,
      description,
      durationSeconds: args?.durationSeconds ?? 240,
    }),
    llm: {
      provider: 'test',
      model: 'test-model',
      rankChapters: async ({ chapters }) => {
        if (args?.modelFails) {
          return {
            ok: false,
            code: 'model_call_failed',
            message: 'boom',
            latencyMs: 1,
          };
        }
        if (args?.inventTimestamps) {
          const grounded = rejectInventedTimestamps(chapters, {
            spans: [{ startTime: 0, endTime: 12 }],
            chapterIndexes: [0],
            rationales: ['invented trim'],
          });
          if (!grounded.ok) {
            return {
              ok: false,
              code: grounded.code,
              message: grounded.message,
              latencyMs: 1,
            };
          }
        }
        const indexes = args?.rankIndexes ?? [0, 1];
        return {
          ok: true,
          data: {
            chapterIndexes: indexes,
            rationales: indexes.map(
              (index) => `Practice ${chapters[index].label}`
            ),
          },
          latencyMs: 1,
        };
      },
    },
  };

  return { deps, intervals, suggestions, jobs, from, rpc };
}

describe('known chapter grounding', () => {
  it('rejects invented finer timestamps and keeps only known spans', () => {
    const chapters = extractChaptersFromDescription(
      ['0:00 Opening stance', '1:15 Grip basics', '3:00 Follow through'].join(
        '\n'
      ),
      240
    );
    assert.equal(chapters.ok, true);
    if (!chapters.ok) return;

    const invented = rejectInventedTimestamps(chapters.chapters, {
      spans: [{ startTime: 0, endTime: 12 }],
      chapterIndexes: [0],
      rationales: ['trim'],
    });
    assert.equal(invented.ok, false);
    if (!invented.ok) {
      assert.equal(invented.code, 'invented_timestamps');
    }

    const selected = selectKnownChapterSpans(chapters.chapters, {
      chapterIndexes: [0, 99, 0, 2],
      rationales: ['A', 'ignored', 'dup', 'C'],
    });
    assert.deepEqual(
      selected.map((span) => span.startTime),
      [0, 180]
    );
  });
});

describe('interval suggestion generation', () => {
  it('stores suggestions for known chapters and reports no_chapters when absent', async () => {
    const withChapters = createSuggestionDb({ rankIndexes: [0, 2] });
    const generated = await generateOwnedIntervalSuggestions(
      withChapters.deps,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      'token',
      'idem-key-chapters-01'
    );
    assert.equal(generated.ok, true);
    if (generated.ok) {
      assert.equal(generated.state, 'suggestions');
      assert.equal(generated.suggestions.length, 2);
      assert.equal(generated.suggestions[0].label, 'Opening stance');
      assert.equal(generated.suggestions[1].startTime, 180);
    }

    const noChapters = createSuggestionDb({
      description: 'No timestamps in this description',
    });
    const empty = await generateOwnedIntervalSuggestions(
      noChapters.deps,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      'token',
      'idem-key-empty-01'
    );
    assert.equal(empty.ok, true);
    if (empty.ok) {
      assert.equal(empty.state, 'no_chapters');
      assert.deepEqual(empty.suggestions, []);
    }
  });

  it('rejects invented timestamps from the model path', async () => {
    const db = createSuggestionDb({ inventTimestamps: true });
    const generated = await generateOwnedIntervalSuggestions(
      db.deps,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      'token',
      'idem-key-invent-01'
    );
    // Model failure falls back to known chapter spans — never invented times.
    assert.equal(generated.ok, true);
    if (generated.ok) {
      assert.equal(generated.state, 'suggestions');
      for (const suggestion of generated.suggestions) {
        assert.ok(
          [0, 75, 180].includes(suggestion.startTime),
          'suggestion start must be a known chapter start'
        );
        assert.notEqual(suggestion.endTime, 12);
      }
    }
  });
});

describe('atomic overwrite and acceptance', () => {
  it('replace_owned_video_intervals removes all owned rows then inserts chapters', async () => {
    const db = createSuggestionDb();
    const otherVideoId = 'bbbbbbbbbbb';
    db.intervals.push(
      {
        id: randomUUID(),
        user_id: OWNER,
        video_id: YOUTUBE_ID,
        name: 'manual loop',
        start_time: 10,
        end_time: 20,
        order_index: 0,
        created_at: '2026-09-26T12:00:00.000Z',
        updated_at: '2026-09-26T12:00:00.000Z',
      },
      {
        id: randomUUID(),
        user_id: OWNER,
        video_id: YOUTUBE_ID,
        name: 'another',
        start_time: 30,
        end_time: 40,
        order_index: 1,
        created_at: '2026-09-26T12:00:00.000Z',
        updated_at: '2026-09-26T12:00:00.000Z',
      },
      {
        id: randomUUID(),
        user_id: OWNER,
        video_id: otherVideoId,
        name: 'other video manual',
        start_time: 1,
        end_time: 2,
        order_index: 0,
        created_at: '2026-09-26T12:00:00.000Z',
        updated_at: '2026-09-26T12:00:00.000Z',
      }
    );

    const { data } = await db.rpc('replace_owned_video_intervals', {
      p_user_id: OWNER,
      p_video_id: YOUTUBE_ID,
      p_intervals: [
        {
          name: 'Opening stance',
          start_time: 0,
          end_time: 75,
          order_index: 0,
        },
      ],
    });

    assert.equal((data as { imported_count: number }).imported_count, 1);
    const targetIntervals = db.intervals.filter(
      (row) => row.video_id === YOUTUBE_ID
    );
    assert.equal(targetIntervals.length, 1);
    assert.equal(targetIntervals[0]?.name, 'Opening stance');
    assert.equal(targetIntervals[0]?.start_time, 0);
    assert.ok(
      db.intervals.some(
        (row) =>
          row.video_id === otherVideoId && row.name === 'other video manual'
      ),
      'intervals on unrelated videos must survive overwrite'
    );
  });

  it('accepts suggestions idempotently and preserves unrelated manual loops', async () => {
    const db = createSuggestionDb({ rankIndexes: [0] });
    const manualId = randomUUID();
    db.intervals.push({
      id: manualId,
      user_id: OWNER,
      video_id: YOUTUBE_ID,
      name: 'My manual loop',
      start_time: 50,
      end_time: 60,
      order_index: 0,
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    });

    const generated = await generateOwnedIntervalSuggestions(
      db.deps,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      'token',
      'idem-key-accept-01'
    );
    assert.equal(generated.ok, true);
    if (!generated.ok) return;

    const suggestionId = generated.suggestions[0]?.id;
    assert.ok(suggestionId);

    const first = await acceptOwnedIntervalSuggestions(
      db.deps.db,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      [suggestionId]
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.accepted[0]?.created, true);
    assert.equal(first.preservedManualCount, 1);
    assert.equal(first.accepted[0]?.interval.name, 'Opening stance');
    assert.equal(first.accepted[0]?.interval.startTime, 0);
    assert.equal(first.accepted[0]?.interval.endTime, 75);
    assert.ok(db.intervals.some((row) => row.id === manualId));

    const second = await acceptOwnedIntervalSuggestions(
      db.deps.db,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      [suggestionId]
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.accepted[0]?.created, false);
    assert.equal(
      db.intervals.filter((row) => row.start_time === 0 && row.end_time === 75)
        .length,
      1
    );
    assert.ok(db.intervals.some((row) => row.id === manualId));
  });

  it('rejects accepting a suggestion not linked to the path video/job', async () => {
    const db = createSuggestionDb({ rankIndexes: [0] });
    const generated = await generateOwnedIntervalSuggestions(
      db.deps,
      OWNER,
      PATH_ID,
      VIDEO_A1,
      'token',
      'idem-key-foreign-01'
    );
    assert.equal(generated.ok, true);
    if (!generated.ok) return;

    const foreign = await acceptOwnedIntervalSuggestions(
      db.deps.db,
      OWNER,
      PATH_ID,
      '99999999-9999-4999-8999-999999999999',
      [generated.suggestions[0].id]
    );
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 404);
    }
  });
});

describe('slice 6 migration contracts', () => {
  it('creates interval_suggestions and atomic replace/accept RPCs', () => {
    const source = readFileSync(
      join(
        root,
        'supabase/migrations/20260926180000_create_interval_suggestions.sql'
      ),
      'utf8'
    );
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS public\.interval_suggestions/
    );
    assert.match(source, /replace_owned_video_intervals/);
    assert.match(source, /accept_interval_suggestion/);
    assert.match(source, /interval_suggestions/);
    assert.match(source, /kind IN \('research', 'interval_suggestions'\)/);
    assert.match(
      source,
      /GRANT ALL ON TABLE public\.interval_suggestions TO service_role/
    );
    assert.doesNotMatch(source, /video_intervals.*REFERENCES public\.paths/);
    // Overwrite deletes all owned rows for the video — not only chapter_import.
    assert.match(
      source,
      /DELETE FROM public\.video_intervals\s+WHERE user_id = p_user_id\s+AND video_id = p_video_id;/
    );
    assert.doesNotMatch(
      source,
      /DELETE FROM public\.video_intervals[\s\S]*source = 'chapter_import'/
    );
    assert.match(source, /'suggestion'/);
  });
});
