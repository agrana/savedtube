import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  DEFAULT_PATH_LEARNING_PREFERENCES,
  pathCreateFormPrefillFromStoredPath,
  resolvePathLearningInput,
  serializePathLearningPreferences,
} from './path-learning-preferences.ts';
import {
  clearResearchIdempotencyKey,
  fingerprintPathResearchRequest,
  getOrCreateResearchIdempotencyKey,
  researchIdempotencyStorageKey,
  shouldClearResearchIdempotencyKey,
} from './path-research-idempotency.ts';
import {
  PATH_REGENERATE_FROM_QUERY_PARAM,
  buildPathRegenerateHref,
  parsePathRegenerateFromQuery,
  parseUpdatePathBody,
  updateOwnedPath,
  type PathRecord,
} from './paths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('path regenerate form helpers', () => {
  it('builds regenerate hrefs with path id only (no prompt or email)', () => {
    const pathId = '11111111-1111-4111-8111-111111111111';
    const href = buildPathRegenerateHref(pathId);
    assert.equal(
      href,
      `/paths/new?${PATH_REGENERATE_FROM_QUERY_PARAM}=${pathId}`
    );
    assert.doesNotMatch(href, /@/);
    assert.doesNotMatch(href, /goal=/i);
    assert.doesNotMatch(href, /prompt=/i);
  });

  it('parses regenerate fromPath query values', () => {
    assert.deepEqual(parsePathRegenerateFromQuery(null), {
      ok: false,
      reason: 'missing',
    });
    assert.deepEqual(parsePathRegenerateFromQuery(''), {
      ok: false,
      reason: 'missing',
    });
    assert.deepEqual(parsePathRegenerateFromQuery('not-a-uuid'), {
      ok: false,
      reason: 'invalid',
    });
    assert.deepEqual(
      parsePathRegenerateFromQuery('11111111-1111-4111-8111-111111111111'),
      { ok: true, pathId: '11111111-1111-4111-8111-111111111111' }
    );
  });

  it('prefills original stored goal and structured preferences', () => {
    const preferences = {
      level: 'advanced' as const,
      maxVideoDurationMinutes: 15 as const,
      style: 'academic' as const,
    };
    const prefill = pathCreateFormPrefillFromStoredPath({
      goal: 'Pass the CKA exam raw prompt',
      background: serializePathLearningPreferences(preferences),
    });
    assert.equal(prefill.goal, 'Pass the CKA exam raw prompt');
    assert.deepEqual(prefill.preferences, preferences);
    assert.equal(prefill.storedAsPreferences, true);
    assert.equal(prefill.legacyBackground, null);
  });

  it('prefills defaults for legacy free-text background paths', () => {
    const prefill = pathCreateFormPrefillFromStoredPath({
      goal: 'Learn Linux networking',
      background: 'I know Linux',
    });
    assert.equal(prefill.goal, 'Learn Linux networking');
    assert.deepEqual(prefill.preferences, {
      ...DEFAULT_PATH_LEARNING_PREFERENCES,
    });
    assert.equal(prefill.storedAsPreferences, false);
    assert.equal(prefill.legacyBackground, 'I know Linux');
  });

  it('never prefills cleaned display labels in place of the raw goal', () => {
    const prefill = pathCreateFormPrefillFromStoredPath({
      goal: 'raw goal with typos!!',
      background: null,
    });
    assert.equal(prefill.goal, 'raw goal with typos!!');
    assert.notEqual(prefill.goal, 'Cleaned Path Title');
  });

  it('accepts edited goal and preferences on update parse', () => {
    assert.equal(parseUpdatePathBody({}).success, false);
    const parsed = parseUpdatePathBody({
      goal: '  Updated goal  ',
      preferences: {
        level: 'intermediate',
        maxVideoDurationMinutes: 20,
        style: 'fun',
      },
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.goal, 'Updated goal');
      assert.equal(parsed.data.background, null);
      assert.deepEqual(parsed.data.preferences, {
        level: 'intermediate',
        maxVideoDurationMinutes: 20,
        style: 'fun',
      });
    }
  });

  it('updateOwnedPath preserves owned legacy background for research, not request injection', async () => {
    const pathId = '66666666-6666-4666-8666-666666666666';
    const rows: PathRecord[] = [
      {
        id: pathId,
        owner: 'user-a',
        goal: 'Learn networking',
        background: 'I know Linux',
        title: 'Learn networking',
        display_objective: 'Learn networking',
        display_path: 'Learn networking',
        active_revision_id: null,
        created_at: '2026-10-17T10:00:00.000Z',
        updated_at: '2026-10-17T10:00:00.000Z',
      },
    ];
    const client = {
      from() {
        const state: {
          filters: { id?: string; owner?: string };
          pendingUpdate?: Partial<PathRecord>;
          mode: 'select' | 'update';
        } = { filters: {}, mode: 'select' };
        const builder = {
          select() {
            return builder;
          },
          update(payload: Partial<PathRecord>) {
            state.mode = 'update';
            state.pendingUpdate = payload;
            return builder;
          },
          eq(column: string, value: string) {
            if (column === 'id') {
              state.filters.id = value;
            }
            if (column === 'owner') {
              state.filters.owner = value;
            }
            return builder;
          },
          async maybeSingle() {
            const row = rows.find((candidate) => {
              if (
                state.filters.id !== undefined &&
                candidate.id !== state.filters.id
              ) {
                return false;
              }
              if (
                state.mode === 'update' &&
                state.filters.owner !== undefined &&
                candidate.owner !== state.filters.owner
              ) {
                return false;
              }
              return true;
            });
            if (!row) {
              return { data: null, error: null };
            }
            if (state.mode === 'select') {
              if (row.owner !== 'user-a') {
                return { data: null, error: null };
              }
              return { data: row, error: null };
            }
            Object.assign(row, state.pendingUpdate, {
              updated_at: '2026-10-17T11:00:00.000Z',
            });
            return { data: row, error: null };
          },
        };
        return builder;
      },
    };

    const updated = await updateOwnedPath(client as never, 'user-a', pathId, {
      goal: 'Learn networking deeply',
      preferences: {
        level: 'advanced',
        maxVideoDurationMinutes: 15,
        style: 'academic',
      },
      // Request-injected background must not become the preserved legacy source.
      background: 'attacker-injected background',
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) {
      return;
    }
    const resolved = resolvePathLearningInput(updated.path.background);
    assert.equal(resolved.storedAsPreferences, true);
    assert.equal(resolved.legacyBackground, 'I know Linux');
    assert.equal(resolved.preferences.level, 'advanced');
  });

  it('research idempotency ignores stale create keys and clears terminal outcomes', () => {
    const pathId = '77777777-7777-4777-8777-777777777777';
    const store: Record<string, string> = {
      [researchIdempotencyStorageKey(pathId)]: 'stale-create-key-aaaaaaaaaaaa',
    };
    const storage = {
      getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(store, key)
          ? store[key]
          : null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
      removeItem(key: string) {
        delete store[key];
      },
    };
    const fingerprint = fingerprintPathResearchRequest('Goal', {
      ...DEFAULT_PATH_LEARNING_PREFERENCES,
    });
    const key = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      { intentId: 'visit-1', fingerprint },
      () => 'regen-key-bbbbbbbbbbbb'
    );
    assert.equal(key, 'regen-key-bbbbbbbbbbbb');
    assert.equal(
      shouldClearResearchIdempotencyKey({
        responseOk: true,
        job: { status: 'succeeded' },
      }),
      true
    );
    clearResearchIdempotencyKey(storage, pathId);
    assert.equal(storage.getItem(researchIdempotencyStorageKey(pathId)), null);
  });
});

describe('path regenerate UI source contract', () => {
  it('labels Regenerate and navigates to form with fromPath (no research on click)', () => {
    const detail = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    const createPage = readFileSync(
      join(root, 'src/app/paths/new/page.tsx'),
      'utf8'
    );

    assert.match(detail, />\s*Regenerate\s*</);
    assert.doesNotMatch(detail, /Regenerate draft/);
    assert.match(detail, /buildPathRegenerateHref\(pathId\)/);
    assert.doesNotMatch(
      detail,
      /stages\.length > 0[\s\S]*onClick=\{\(\) => void handleResearch\(\)\}[\s\S]*Regenerate/
    );

    assert.match(createPage, /PATH_REGENERATE_FROM_QUERY_PARAM/);
    assert.match(createPage, /pathCreateFormPrefillFromStoredPath/);
    assert.match(createPage, /method: 'PATCH'/);
    assert.match(createPage, /Regenerate path/);
    assert.match(createPage, /Loading your saved goal and preferences/);
    assert.match(createPage, /Nothing is researched until you submit/);
    assert.match(createPage, /Suspense/);
    assert.match(createPage, /useSearchParams/);

    // Fresh create remains available and still POSTs a new path.
    assert.match(createPage, /Create and research/);
    assert.match(createPage, /method: 'POST'/);
    assert.match(createPage, /fetch\('\/api\/paths'/);
    assert.match(createPage, /PATH_CREATE_DRAFT_STORAGE_KEY/);
    assert.match(createPage, /regeneratePathId \|\| regenerateQueryInvalid/);
    assert.match(createPage, /getOrCreateResearchIdempotencyKey/);
    assert.match(createPage, /fingerprintPathResearchRequest/);
    assert.match(createPage, /createResearchFormVisitIntentId/);
    assert.match(createPage, /shouldClearResearchIdempotencyKey/);
    assert.match(
      createPage,
      /Leaving regenerate without a stored draft must not keep old settings/
    );
  });

  it('keeps empty-path research action on path detail for initial research', () => {
    const detail = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    assert.match(detail, /Research path/);
    assert.match(detail, /Retry research/);
    assert.match(detail, /void handleResearch\(\)/);
  });
});
