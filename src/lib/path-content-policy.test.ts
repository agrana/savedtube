import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResearchCandidate } from './path-research-schema.ts';
import {
  filterObviousPromotionalCandidates,
  inspectPromotionalCandidate,
  isObviousPromotionalCandidate,
} from './path-content-policy.ts';

function candidate(
  overrides: Partial<ResearchCandidate> = {}
): ResearchCandidate {
  return {
    youtubeVideoId: 'abcdefghijk',
    title: 'Understanding distributed systems',
    channelTitle: 'Learning Channel',
    durationSeconds: 600,
    thumbnailUrl: null,
    descriptionExcerpt: 'A practical explanation with examples.',
    ...overrides,
  };
}

describe('path content policy', () => {
  it('identifies obvious promotional signals in metadata', () => {
    assert.equal(
      isObviousPromotionalCandidate(
        candidate({ descriptionExcerpt: 'Use code LEARN20 for a discount.' })
      ),
      true
    );
    assert.equal(
      isObviousPromotionalCandidate(
        candidate({ title: 'Product launch: our new platform' })
      ),
      true
    );
    assert.equal(
      isObviousPromotionalCandidate(
        candidate({
          descriptionExcerpt: 'This video is sponsored by Example Co.',
        })
      ),
      true
    );
  });

  it('keeps ordinary educational videos', () => {
    const result = inspectPromotionalCandidate(
      candidate({
        title: 'How databases use indexes',
        descriptionExcerpt: 'Learn how B-trees support efficient lookups.',
      })
    );
    assert.equal(result.promotional, false);
    assert.equal(result.matchedText, null);
  });

  it('removes promotional candidates before model selection', () => {
    const result = filterObviousPromotionalCandidates(
      new Map([
        [
          0,
          [
            candidate({ youtubeVideoId: 'abcdefghijk' }),
            candidate({
              youtubeVideoId: 'lmnopqrstuv',
              title: 'Buy my course: master the topic',
            }),
          ],
        ],
      ])
    );
    assert.deepEqual(
      result.candidatesByStage.get(0)?.map((item) => item.youtubeVideoId),
      ['abcdefghijk']
    );
    assert.deepEqual(
      result.excludedCandidates.map((item) => item.youtubeVideoId),
      ['lmnopqrstuv']
    );
  });
});
