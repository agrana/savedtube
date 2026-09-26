import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractChaptersFromDescription,
  findKnownChapterSpan,
  parseChapterTimestampToSeconds,
  parseIsoDurationToSeconds,
} from './youtube-chapters.ts';

describe('chapter timestamp parsing', () => {
  it('parses M:SS and H:MM:SS timestamps', () => {
    assert.equal(parseChapterTimestampToSeconds('0:00'), 0);
    assert.equal(parseChapterTimestampToSeconds('1:30'), 90);
    assert.equal(parseChapterTimestampToSeconds('1:02:03'), 3723);
  });

  it('rejects malformed timestamps', () => {
    assert.equal(parseChapterTimestampToSeconds('1:60'), null);
    assert.equal(parseChapterTimestampToSeconds('99'), null);
    assert.equal(parseChapterTimestampToSeconds('a:b'), null);
  });

  it('parses ISO durations', () => {
    assert.equal(parseIsoDurationToSeconds('PT1H2M3S'), 3723);
    assert.equal(parseIsoDurationToSeconds('PT15M'), 900);
    assert.equal(parseIsoDurationToSeconds('bad'), null);
  });
});

describe('extractChaptersFromDescription', () => {
  it('preserves chapter labels and ascending order with valid bounds', () => {
    const description = [
      'Intro notes',
      '0:00 Opening stance',
      '1:15 Grip basics',
      '3:00 Follow through',
      'Thanks for watching',
    ].join('\n');

    const result = extractChaptersFromDescription(description, 240);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(
      result.chapters.map((chapter) => ({
        label: chapter.label,
        startTime: chapter.startTime,
        endTime: chapter.endTime,
      })),
      [
        { label: 'Opening stance', startTime: 0, endTime: 75 },
        { label: 'Grip basics', startTime: 75, endTime: 180 },
        { label: 'Follow through', startTime: 180, endTime: 240 },
      ]
    );
  });

  it('rejects missing duration and no-chapter descriptions', () => {
    const missing = extractChaptersFromDescription('0:00 Intro', null);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, 'missing_duration');
    }

    const none = extractChaptersFromDescription('No timestamps here', 120);
    assert.equal(none.ok, false);
    if (!none.ok) {
      assert.equal(none.code, 'no_chapters');
      assert.deepEqual(none.chapters, []);
    }
  });

  it('skips out-of-bounds starts and rejects spans that cannot form valid intervals', () => {
    const outOfBounds = extractChaptersFromDescription(
      ['0:00 Start', '10:00 Beyond duration'].join('\n'),
      60
    );
    assert.equal(outOfBounds.ok, true);
    if (outOfBounds.ok) {
      assert.equal(outOfBounds.chapters.length, 1);
      assert.equal(outOfBounds.chapters[0].endTime, 60);
    }

    const sameStartTwice = extractChaptersFromDescription(
      ['0:00 First', '0:00 Duplicate label'].join('\n'),
      30
    );
    assert.equal(sameStartTwice.ok, true);
    if (sameStartTwice.ok) {
      assert.equal(sameStartTwice.chapters.length, 1);
      assert.equal(sameStartTwice.chapters[0].label, 'First');
    }
  });

  it('only recognizes known chapter spans for suggestion grounding', () => {
    const chapters = [
      { label: 'A', startTime: 0, endTime: 30 },
      { label: 'B', startTime: 30, endTime: 60 },
    ];
    assert.ok(findKnownChapterSpan(chapters, 0, 30));
    assert.equal(findKnownChapterSpan(chapters, 0, 15), null);
    assert.equal(findKnownChapterSpan(chapters, 5, 30), null);
  });

  it('preserves labels when the timestamp trails the title', () => {
    const result = extractChaptersFromDescription(
      ['Opening stance 0:00', 'Grip basics - 1:15', '3:00 Follow through'].join(
        '\n'
      ),
      240
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.chapters.map((chapter) => chapter.label),
      ['Opening stance', 'Grip basics', 'Follow through']
    );
    assert.ok(
      result.chapters.every(
        (chapter) =>
          chapter.startTime >= 0 &&
          chapter.startTime < chapter.endTime &&
          chapter.endTime <= 240
      )
    );
  });
});
