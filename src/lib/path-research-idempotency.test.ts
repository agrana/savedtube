import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearResearchIdempotencyKey,
  createResearchFormVisitIntentId,
  fingerprintPathResearchRequest,
  getOrCreateResearchIdempotencyKey,
  researchIdempotencyStorageKey,
  shouldClearResearchIdempotencyKey,
  type ResearchIdempotencyStorage,
} from './path-research-idempotency.ts';

function memoryStorage(
  initial: Record<string, string> = {}
): ResearchIdempotencyStorage & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
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
}

const prefs = {
  level: 'beginner' as const,
  maxVideoDurationMinutes: null,
  style: 'corporate' as const,
};

describe('path research idempotency helpers', () => {
  it('fingerprints canonical trimmed goal and preferences', () => {
    assert.equal(
      fingerprintPathResearchRequest('  Learn Rust  ', prefs),
      fingerprintPathResearchRequest('Learn Rust', prefs)
    );
    assert.notEqual(
      fingerprintPathResearchRequest('Learn Rust', prefs),
      fingerprintPathResearchRequest('Learn Rust', {
        ...prefs,
        level: 'advanced',
      })
    );
  });

  it('reuses the same key on retry within the same form visit and fingerprint', () => {
    const storage = memoryStorage();
    const pathId = '11111111-1111-4111-8111-111111111111';
    const intent = {
      intentId: 'visit-a',
      fingerprint: fingerprintPathResearchRequest('Goal', prefs),
    };
    let minted = 0;
    const createKey = () => {
      minted += 1;
      return `minted-key-${minted}-xxxxxxxx`;
    };

    const first = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      intent,
      createKey
    );
    const retry = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      intent,
      createKey
    );
    assert.equal(first, 'minted-key-1-xxxxxxxx');
    assert.equal(retry, first);
    assert.equal(minted, 1);
  });

  it('mints a new key after edited settings (fingerprint change)', () => {
    const storage = memoryStorage();
    const pathId = '11111111-1111-4111-8111-111111111111';
    const intentId = 'visit-a';
    let minted = 0;
    const createKey = () => {
      minted += 1;
      return `minted-key-${minted}-xxxxxxxx`;
    };

    const first = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      {
        intentId,
        fingerprint: fingerprintPathResearchRequest('Goal', prefs),
      },
      createKey
    );
    const edited = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      {
        intentId,
        fingerprint: fingerprintPathResearchRequest('Goal edited', prefs),
      },
      createKey
    );
    assert.equal(first, 'minted-key-1-xxxxxxxx');
    assert.equal(edited, 'minted-key-2-xxxxxxxx');
    assert.notEqual(first, edited);
  });

  it('mints a new key on a new form visit even with the same fingerprint', () => {
    const storage = memoryStorage();
    const pathId = '11111111-1111-4111-8111-111111111111';
    const fingerprint = fingerprintPathResearchRequest('Goal', prefs);
    let minted = 0;
    const createKey = () => {
      minted += 1;
      return `minted-key-${minted}-xxxxxxxx`;
    };

    const firstVisit = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      { intentId: 'visit-a', fingerprint },
      createKey
    );
    const secondVisit = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      { intentId: 'visit-b', fingerprint },
      createKey
    );
    assert.notEqual(firstVisit, secondVisit);
    assert.equal(minted, 2);
  });

  it('ignores legacy bare UUID keys left by successful fresh create', () => {
    const pathId = '11111111-1111-4111-8111-111111111111';
    const staleCreateKey = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const storage = memoryStorage({
      [researchIdempotencyStorageKey(pathId)]: staleCreateKey,
    });
    const key = getOrCreateResearchIdempotencyKey(
      storage,
      pathId,
      {
        intentId: 'regenerate-visit',
        fingerprint: fingerprintPathResearchRequest('Goal', prefs),
      },
      () => 'fresh-regenerate-key-xx'
    );
    assert.equal(key, 'fresh-regenerate-key-xx');
    assert.notEqual(key, staleCreateKey);
  });

  it('clears terminal keys and reports when to clear', () => {
    const pathId = '11111111-1111-4111-8111-111111111111';
    const storage = memoryStorage({
      [researchIdempotencyStorageKey(pathId)]: JSON.stringify({
        key: 'terminal-key-xxxxxxxx',
        intentId: 'visit-a',
        fingerprint: 'fp',
      }),
    });
    clearResearchIdempotencyKey(storage, pathId);
    assert.equal(storage.getItem(researchIdempotencyStorageKey(pathId)), null);

    assert.equal(shouldClearResearchIdempotencyKey({ responseOk: true }), true);
    assert.equal(
      shouldClearResearchIdempotencyKey({
        responseOk: false,
        job: { status: 'failed' },
      }),
      true
    );
    assert.equal(
      shouldClearResearchIdempotencyKey({
        responseOk: false,
        job: { status: 'succeeded' },
      }),
      true
    );
    assert.equal(
      shouldClearResearchIdempotencyKey({
        responseOk: false,
        job: { status: 'running' },
      }),
      false
    );
    assert.equal(
      shouldClearResearchIdempotencyKey({ responseOk: false }),
      false
    );
  });

  it('creates distinct form visit intent ids', () => {
    const a = createResearchFormVisitIntentId();
    const b = createResearchFormVisitIntentId();
    assert.notEqual(a, b);
    assert.ok(a.length >= 8);
  });
});
