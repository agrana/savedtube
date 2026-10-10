'use client';

import { useState } from 'react';
import type { PathVideoDismissalReviewItem } from '@/lib/path-dismissals';
import {
  PATH_VIDEO_DISMISSAL_REASON_LABELS,
  buildPathVideoDismissalRestorePayload,
} from '@/lib/path-dismissal-ui';

type Props = {
  pathId: string;
  dismissals: PathVideoDismissalReviewItem[];
  onRestored?: () => void | Promise<void>;
};

export default function PathDismissedVideosReview({
  pathId,
  dismissals,
  onRestored,
}: Props) {
  const [restoringPathVideoId, setRestoringPathVideoId] = useState<
    string | null
  >(null);
  const [errorByPathVideoId, setErrorByPathVideoId] = useState<
    Record<string, string>
  >({});

  if (dismissals.length === 0) {
    return null;
  }

  const restore = async (item: PathVideoDismissalReviewItem) => {
    if (restoringPathVideoId) {
      return;
    }
    setRestoringPathVideoId(item.pathVideoId);
    setErrorByPathVideoId((prev) => {
      const next = { ...prev };
      delete next[item.pathVideoId];
      return next;
    });
    try {
      const payload = buildPathVideoDismissalRestorePayload({
        pathId,
        pathVideoId: item.pathVideoId,
      });
      const response = await fetch(`/api/paths/${pathId}/dismissals`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorByPathVideoId((prev) => ({
          ...prev,
          [item.pathVideoId]:
            typeof data.error === 'string' && data.error
              ? data.error
              : 'Failed to restore this video',
        }));
        return;
      }
      await onRestored?.();
    } catch (err) {
      console.error('path video restore error:', err);
      setErrorByPathVideoId((prev) => ({
        ...prev,
        [item.pathVideoId]: 'Failed to restore this video',
      }));
    } finally {
      setRestoringPathVideoId(null);
    }
  };

  return (
    <section
      className="mb-8 space-y-3"
      aria-labelledby="dismissed-videos-heading"
    >
      <h2
        id="dismissed-videos-heading"
        className="text-xl font-medium tracking-[-0.03em] text-stone-100"
      >
        Hidden from this path
      </h2>
      <p className="text-sm text-stone-400">
        These videos stay in the path. Restore one to show it in the map and
        sequence again.
      </p>
      <ul className="space-y-2">
        {dismissals.map((item) => {
          const reasonLabel =
            PATH_VIDEO_DISMISSAL_REASON_LABELS[item.reason] || item.reason;
          const isRestoring = restoringPathVideoId === item.pathVideoId;
          const error = errorByPathVideoId[item.pathVideoId];
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-[#10100d]/80 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-100">
                  {item.title}
                </p>
                <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-stone-500">
                  {item.youtubeVideoId}
                  <span className="mx-2 text-stone-600">·</span>
                  {reasonLabel}
                </p>
                {error && (
                  <p className="mt-2 text-sm text-red-300" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={Boolean(restoringPathVideoId)}
                onClick={() => void restore(item)}
                className="rounded-full border border-amber-200/25 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-50 disabled:opacity-40"
              >
                {isRestoring ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
