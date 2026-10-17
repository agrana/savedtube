import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PATH_LEARNING_PREFERENCES,
  augmentSearchQueryWithPreferences,
  buildBroaderSearchQuery,
  buildStageSearchQueryLadder,
  durationCapFailureMessage,
  filterCandidatesByMaxVideoDuration,
  noTopicMatchFailureMessage,
  normalizePathLearningPreferences,
  parsePathCreateDraft,
  parsePathLearningPreferences,
  preferencesFromResearchSnapshot,
  resolvePathLearningInput,
  serializePathCreateDraft,
  serializePathLearningPreferences,
} from './path-learning-preferences.ts';
import type { ResearchCandidate } from './path-research-schema.ts';
import { createOwnedPath, parseCreatePathBody } from './paths.ts';

function candidate(
  id: string,
  durationSeconds: number | null
): ResearchCandidate {
  return {
    youtubeVideoId: id,
    title: `Video ${id}`,
    channelTitle: 'Channel',
    durationSeconds,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

describe('path learning preference validation', () => {
  it('normalizes defaults and rejects invalid enums', () => {
    assert.deepEqual(normalizePathLearningPreferences({}), {
      ...DEFAULT_PATH_LEARNING_PREFERENCES,
    });
    assert.deepEqual(
      normalizePathLearningPreferences({
        level: 'advanced',
        maxVideoDurationMinutes: 15,
        style: 'academic',
      }),
      {
        level: 'advanced',
        maxVideoDurationMinutes: 15,
        style: 'academic',
      }
    );

    const invalid = parsePathLearningPreferences({
      level: 'expert',
      maxVideoDurationMinutes: null,
      style: 'corporate',
    });
    assert.equal(invalid.success, false);

    const badDuration = parsePathLearningPreferences({
      level: 'beginner',
      maxVideoDurationMinutes: 7,
      style: 'fun',
    });
    assert.equal(badDuration.success, false);
  });

  it('validates preferences on create and keeps legacy background creates working', () => {
    const withPrefs = parseCreatePathBody({
      goal: 'Pass the CKA',
      preferences: {
        level: 'intermediate',
        maxVideoDurationMinutes: 20,
        style: 'fun',
      },
    });
    assert.equal(withPrefs.success, true);
    if (withPrefs.success) {
      assert.equal(withPrefs.data.background, null);
      assert.deepEqual(withPrefs.data.preferences, {
        level: 'intermediate',
        maxVideoDurationMinutes: 20,
        style: 'fun',
      });
    }

    const legacy = parseCreatePathBody({
      goal: 'Pass the CKA',
      background: 'Linux admin',
    });
    assert.equal(legacy.success, true);
    if (legacy.success) {
      assert.equal(legacy.data.background, 'Linux admin');
      assert.equal(legacy.data.preferences, null);
    }

    const rejected = parseCreatePathBody({
      goal: 'Pass the CKA',
      preferences: { level: 'novice', style: 'corporate' },
    });
    assert.equal(rejected.success, false);
  });
});

describe('path learning preference serialization and persistence', () => {
  it('round-trips structured prefs through background storage without treating them as free text', () => {
    const prefs = {
      level: 'advanced' as const,
      maxVideoDurationMinutes: 10 as const,
      style: 'academic' as const,
    };
    const stored = serializePathLearningPreferences(prefs);
    const resolved = resolvePathLearningInput(stored);
    assert.equal(resolved.storedAsPreferences, true);
    assert.equal(resolved.legacyBackground, null);
    assert.deepEqual(resolved.preferences, prefs);

    const legacy = resolvePathLearningInput('I know Linux');
    assert.equal(legacy.storedAsPreferences, false);
    assert.equal(legacy.legacyBackground, 'I know Linux');
    assert.deepEqual(legacy.preferences, DEFAULT_PATH_LEARNING_PREFERENCES);
  });

  it('preserves optional legacyBackground in envelopes and accepts previous envelopes', () => {
    const prefs = {
      level: 'intermediate' as const,
      maxVideoDurationMinutes: 20 as const,
      style: 'fun' as const,
    };
    const withLegacy = serializePathLearningPreferences(prefs, {
      legacyBackground: '  I know Linux  ',
    });
    const resolved = resolvePathLearningInput(withLegacy);
    assert.equal(resolved.storedAsPreferences, true);
    assert.equal(resolved.legacyBackground, 'I know Linux');
    assert.deepEqual(resolved.preferences, prefs);

    const previousEnvelope = JSON.stringify({
      savedtubeLearningPreferences: 1,
      level: 'beginner',
      maxVideoDurationMinutes: null,
      style: 'corporate',
    });
    const previous = resolvePathLearningInput(previousEnvelope);
    assert.equal(previous.storedAsPreferences, true);
    assert.equal(previous.legacyBackground, null);
    assert.deepEqual(previous.preferences, DEFAULT_PATH_LEARNING_PREFERENCES);
  });

  it('persists preferences on create and leaves old free-text background paths intact', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      from() {
        const state: {
          payload: Record<string, unknown> | null;
        } = { payload: null };
        const builder = {
          insert(payload: Record<string, unknown>) {
            state.payload = payload;
            return builder;
          },
          select() {
            return builder;
          },
          async single() {
            const row = {
              id: '11111111-1111-4111-8111-111111111111',
              owner: state.payload?.owner,
              goal: state.payload?.goal,
              background: state.payload?.background ?? null,
              title: state.payload?.title,
              display_objective: state.payload?.display_objective,
              display_path: state.payload?.display_path,
              active_revision_id: null,
              created_at: '2026-10-17T10:00:00.000Z',
              updated_at: '2026-10-17T10:00:00.000Z',
            };
            rows.push(row);
            return { data: row, error: null };
          },
        };
        return builder;
      },
    };

    const created = await createOwnedPath(client as never, 'user-a', {
      goal: 'Pass the CKA',
      background: null,
      preferences: {
        level: 'beginner',
        maxVideoDurationMinutes: 30,
        style: 'corporate',
      },
    });
    assert.equal(created.ok, true);
    if (created.ok) {
      const resolved = resolvePathLearningInput(created.path.background);
      assert.equal(resolved.storedAsPreferences, true);
      assert.equal(resolved.preferences.maxVideoDurationMinutes, 30);
      assert.equal(created.path.goal, 'Pass the CKA');
    }

    const legacyCreated = await createOwnedPath(client as never, 'user-a', {
      goal: 'Learn darts',
      background: 'Recreational player',
      preferences: null,
    });
    assert.equal(legacyCreated.ok, true);
    if (legacyCreated.ok) {
      assert.equal(legacyCreated.path.background, 'Recreational player');
      assert.equal(
        resolvePathLearningInput(legacyCreated.path.background)
          .storedAsPreferences,
        false
      );
    }
  });

  it('reads preferences from research snapshots for regeneration compatibility', () => {
    const fromField = preferencesFromResearchSnapshot({
      goal: 'CKA',
      background: null,
      preferences: {
        level: 'intermediate',
        maxVideoDurationMinutes: 5,
        style: 'fun',
      },
    });
    assert.deepEqual(fromField.preferences, {
      level: 'intermediate',
      maxVideoDurationMinutes: 5,
      style: 'fun',
    });

    const fromLegacy = preferencesFromResearchSnapshot({
      goal: 'CKA',
      background: 'I know Linux',
    });
    assert.equal(fromLegacy.legacyBackground, 'I know Linux');
    assert.deepEqual(fromLegacy.preferences, DEFAULT_PATH_LEARNING_PREFERENCES);
  });
});

describe('duration filtering and search query propagation', () => {
  it('rejects over-limit and unknown durations when capped, and keeps them when uncapped', () => {
    const pool = new Map<number, ResearchCandidate[]>([
      [
        0,
        [
          candidate('aaaaaaaaaaa', 240),
          candidate('bbbbbbbbbbb', 601),
          candidate('ccccccccccc', null),
        ],
      ],
    ]);

    const capped = filterCandidatesByMaxVideoDuration(pool, {
      level: 'beginner',
      maxVideoDurationMinutes: 10,
      style: 'corporate',
    });
    assert.equal(capped.candidatesByStage.get(0)?.length, 1);
    assert.equal(
      capped.candidatesByStage.get(0)?.[0]?.youtubeVideoId,
      'aaaaaaaaaaa'
    );
    assert.equal(capped.rejectedCount, 2);
    assert.deepEqual(capped.emptyStages, []);

    const boundary = filterCandidatesByMaxVideoDuration(
      new Map([[0, [candidate('ddddddddddd', 600)]]]),
      {
        level: 'beginner',
        maxVideoDurationMinutes: 10,
        style: 'corporate',
      }
    );
    assert.equal(boundary.candidatesByStage.get(0)?.length, 1);

    const uncapped = filterCandidatesByMaxVideoDuration(pool, {
      ...DEFAULT_PATH_LEARNING_PREFERENCES,
      maxVideoDurationMinutes: null,
    });
    assert.equal(uncapped.candidatesByStage.get(0)?.length, 3);
    assert.equal(uncapped.rejectedCount, 0);

    assert.match(
      durationCapFailureMessage({
        level: 'beginner',
        maxVideoDurationMinutes: 15,
        style: 'corporate',
      }),
      /15-minute/
    );
  });

  it('augments search queries with level and style hints as optional soft bias', () => {
    const query = augmentSearchQueryWithPreferences('kubernetes basics', {
      level: 'advanced',
      maxVideoDurationMinutes: null,
      style: 'academic',
    });
    assert.match(query, /kubernetes basics/);
    assert.match(query, /advanced/);
    assert.match(query, /academic/);
  });

  it('builds a base-first ladder with broader entity-preserving fallback', () => {
    const ladder = buildStageSearchQueryLadder(
      'Jev TypeSafe AI decision model walkthrough',
      {
        level: 'beginner',
        maxVideoDurationMinutes: null,
        style: 'corporate',
      }
    );
    assert.equal(ladder[0], 'Jev TypeSafe AI decision model walkthrough');
    assert.ok(ladder.some((query) => /beginner/.test(query)));
    assert.ok(ladder.some((query) => /professional corporate/.test(query)));
    const broader = buildBroaderSearchQuery(
      'Jev TypeSafe AI decision model walkthrough'
    );
    assert.ok(broader);
    assert.match(String(broader), /Jev/);
    assert.match(String(broader), /TypeSafe/);
    assert.doesNotMatch(String(broader), /walkthrough/i);
    assert.ok(ladder.includes(String(broader)));
    assert.equal(new Set(ladder).size, ladder.length);
    assert.match(noTopicMatchFailureMessage(), /matched this path/);
  });
});

describe('path create draft local storage compatibility', () => {
  it('serializes v2 drafts and safely restores legacy goal/background drafts', () => {
    const serialized = serializePathCreateDraft({
      goal: 'Pass the CKA',
      preferences: {
        level: 'intermediate',
        maxVideoDurationMinutes: 20,
        style: 'fun',
      },
    });
    const restored = parsePathCreateDraft(serialized);
    assert.ok(restored);
    assert.equal(restored?.goal, 'Pass the CKA');
    assert.equal(restored?.preferences.level, 'intermediate');
    assert.equal(restored?.preferences.maxVideoDurationMinutes, 20);

    const legacy = parsePathCreateDraft(
      JSON.stringify({ goal: 'Learn darts', background: 'Casual player' })
    );
    assert.ok(legacy);
    assert.equal(legacy?.goal, 'Learn darts');
    assert.deepEqual(legacy?.preferences, DEFAULT_PATH_LEARNING_PREFERENCES);
  });
});
