import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATH_VIDEO_DISMISSAL_REASONS } from './path-dismissals.ts';
import {
  PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
  PATH_VIDEO_DISMISSAL_REASON_LABELS,
  PATH_VIDEO_DISMISSAL_REASON_OPTIONS,
  buildPathVideoDismissalRestorePayload,
  buildPathVideoDismissalSubmitPayload,
} from './path-dismissal-ui.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const VALID_PATH_ID = '11111111-1111-4111-8111-111111111111';
const VALID_PATH_VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const VALID_YOUTUBE_ID = 'dQw4w9WgXcQ';

describe('path dismissal reason labels', () => {
  it('maps every confirmed reason code to a user-friendly label', () => {
    assert.deepEqual(
      [...PATH_VIDEO_DISMISSAL_REASONS],
      [
        'too_easy',
        'too_hard',
        'poor_quality',
        'not_relevant',
        'duplicate',
        'outdated',
        'wrong_language',
        'already_known',
        'other',
      ]
    );
    assert.deepEqual(PATH_VIDEO_DISMISSAL_REASON_LABELS, {
      too_easy: 'Too easy',
      too_hard: 'Too hard',
      poor_quality: 'Poor quality',
      not_relevant: 'Not relevant',
      duplicate: 'Duplicate',
      outdated: 'Outdated',
      wrong_language: 'Wrong language',
      already_known: 'Already known',
      other: 'Other',
    });
    assert.equal(
      PATH_VIDEO_DISMISSAL_REASON_OPTIONS.length,
      PATH_VIDEO_DISMISSAL_REASONS.length
    );
    for (const option of PATH_VIDEO_DISMISSAL_REASON_OPTIONS) {
      assert.equal(
        option.label,
        PATH_VIDEO_DISMISSAL_REASON_LABELS[option.reason]
      );
    }
  });

  it('preserves the exact broader-feedback checkbox label', () => {
    assert.equal(
      PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
      'This could be a problem for other users'
    );
  });

  it('builds the dismissals POST payload with broaderFeedback', () => {
    const payload = buildPathVideoDismissalSubmitPayload({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'not_relevant',
      broaderFeedback: true,
    });
    assert.deepEqual(payload, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'not_relevant',
      broaderFeedback: true,
    });
  });

  it('builds the dismissals DELETE restore payload', () => {
    const payload = buildPathVideoDismissalRestorePayload({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
    });
    assert.deepEqual(payload, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
    });
  });
});

describe('path-detail dismissal UI wiring (source)', () => {
  it('PathVideoDismissControl posts to dismissals with reasons and checkbox', () => {
    const source = readFileSync(
      join(root, 'src/components/PathVideoDismissControl.tsx'),
      'utf8'
    );
    assert.match(source, /\/api\/paths\/\$\{pathId\}\/dismissals/);
    assert.match(source, /method:\s*'POST'/);
    assert.match(source, /buildPathVideoDismissalSubmitPayload/);
    assert.match(source, /PATH_VIDEO_DISMISSAL_REASON_OPTIONS/);
    assert.match(source, /PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL/);
    assert.match(
      source,
      /This could be a problem for other users|PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL/
    );
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /Escape/);
    assert.match(source, /type="radio"/);
    assert.match(source, /type="checkbox"/);
    assert.match(source, /checked=\{broaderFeedback\}/);
    assert.match(source, /isSubmitting/);
    assert.match(source, /role="alert"/);
    assert.match(source, /onDismissed/);
    assert.doesNotMatch(source, /remove_item/);
    assert.doesNotMatch(source, /scope|global.?rule|createOpenAi|llm/i);
    assert.doesNotMatch(source, /method:\s*'DELETE'/);
  });

  it('path detail replaces hard remove with soft-dismiss control', () => {
    const source = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    assert.match(
      source,
      /import PathVideoDismissControl from '@\/components\/PathVideoDismissControl'/
    );
    assert.match(source, /<PathVideoDismissControl/);
    assert.match(source, /pathVideoId=\{video\.id\}/);
    assert.match(source, /youtubeVideoId=\{video\.youtube_video_id\}/);
    assert.match(source, /onDismissed=\{\(\) => void fetchPath\(\)\}/);
    assert.doesNotMatch(source, /Remove this video from the path\?/);
    assert.doesNotMatch(
      source,
      /action:\s*'remove_item'[\s\S]{0,80}pathVideoId:\s*video\.id/
    );
    // Other edit controls remain available on the detail page.
    assert.match(source, /action: 'reorder_items'/);
    assert.match(source, /action: 'move_item'/);
    assert.match(source, /action: 'replace'/);
    assert.match(source, /action: 'add'/);
    assert.match(source, /mark_practiced/);
  });

  it('watch screen exposes dismissal beside path practice controls', () => {
    const source = readFileSync(
      join(root, 'src/app/watch/[videoId]/page.tsx'),
      'utf8'
    );
    assert.match(
      source,
      /import PathVideoDismissControl from '@\/components\/PathVideoDismissControl'/
    );
    assert.match(source, /<PathVideoDismissControl/);
    assert.match(source, /pathId=\{pathId as string\}/);
    assert.match(source, /pathVideoId=\{pathVideoId as string\}/);
    assert.match(source, /youtubeVideoId=\{videoId\}/);
    assert.match(
      source,
      /onDismissed=\{\(\) => router\.push\(pathContext\.returnHref\)\}/
    );
  });

  it('path detail loads dismissed review and restores via DELETE', () => {
    const pageSource = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    const reviewSource = readFileSync(
      join(root, 'src/components/PathDismissedVideosReview.tsx'),
      'utf8'
    );

    assert.match(
      pageSource,
      /import PathDismissedVideosReview from '@\/components\/PathDismissedVideosReview'/
    );
    assert.match(pageSource, /\/api\/paths\/\$\{pathId\}\/dismissals/);
    assert.match(pageSource, /<PathDismissedVideosReview/);
    assert.match(pageSource, /onRestored=\{\(\) => fetchPath\(\)\}/);
    assert.match(pageSource, /dismissedVideos/);

    assert.match(reviewSource, /method:\s*'DELETE'/);
    assert.match(reviewSource, /buildPathVideoDismissalRestorePayload/);
    assert.match(reviewSource, /PATH_VIDEO_DISMISSAL_REASON_LABELS/);
    assert.match(reviewSource, /Restore/);
    assert.match(reviewSource, /item\.title/);
    assert.match(reviewSource, /item\.youtubeVideoId/);
    assert.doesNotMatch(reviewSource, /createOpenAi|llm|global.?rule/i);
    assert.doesNotMatch(reviewSource, /remove_item/);
    // Broader-feedback checkbox label stays exact; restore UI does not redefine it.
    assert.equal(
      PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
      'This could be a problem for other users'
    );
  });
});
