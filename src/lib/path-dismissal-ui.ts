import {
  PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
  PATH_VIDEO_DISMISSAL_REASONS,
  type PathVideoDismissalReason,
} from './path-dismissals';

/**
 * User-facing labels for soft-dismiss reasons on the authenticated path-detail UI.
 * Codes stay snake_case for the POST body; labels are display-only.
 */
export const PATH_VIDEO_DISMISSAL_REASON_LABELS: Record<
  PathVideoDismissalReason,
  string
> = {
  too_easy: 'Too easy',
  too_hard: 'Too hard',
  poor_quality: 'Poor quality',
  not_relevant: 'Not relevant',
  duplicate: 'Duplicate',
  outdated: 'Outdated',
  wrong_language: 'Wrong language',
  already_known: 'Already known',
  other: 'Other',
};

export const PATH_VIDEO_DISMISSAL_REASON_OPTIONS =
  PATH_VIDEO_DISMISSAL_REASONS.map((reason) => ({
    reason,
    label: PATH_VIDEO_DISMISSAL_REASON_LABELS[reason],
  }));

export type PathVideoDismissalSubmitPayload = {
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  reason: PathVideoDismissalReason;
  broaderFeedback: boolean;
};

export type PathVideoDismissalRestorePayload = {
  pathId: string;
  pathVideoId: string;
};

/** Build the JSON body for POST /api/paths/[pathId]/dismissals. */
export function buildPathVideoDismissalSubmitPayload(args: {
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  reason: PathVideoDismissalReason;
  broaderFeedback: boolean;
}): PathVideoDismissalSubmitPayload {
  return {
    pathId: args.pathId,
    pathVideoId: args.pathVideoId,
    youtubeVideoId: args.youtubeVideoId,
    reason: args.reason,
    broaderFeedback: args.broaderFeedback,
  };
}

/** Build the JSON body for DELETE /api/paths/[pathId]/dismissals (restore). */
export function buildPathVideoDismissalRestorePayload(args: {
  pathId: string;
  pathVideoId: string;
}): PathVideoDismissalRestorePayload {
  return {
    pathId: args.pathId,
    pathVideoId: args.pathVideoId,
  };
}

export { PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL };
