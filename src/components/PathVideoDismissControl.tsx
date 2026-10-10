'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { PathVideoDismissalReason } from '@/lib/path-dismissals';
import {
  PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
  PATH_VIDEO_DISMISSAL_REASON_OPTIONS,
  buildPathVideoDismissalSubmitPayload,
} from '@/lib/path-dismissal-ui';

type Props = {
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  videoTitle?: string;
  disabled?: boolean;
  onDismissed?: () => void | Promise<void>;
};

export default function PathVideoDismissControl({
  pathId,
  pathVideoId,
  youtubeVideoId,
  videoTitle,
  disabled = false,
  onDismissed,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<PathVideoDismissalReason | null>(null);
  const [broaderFeedback, setBroaderFeedback] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (isSubmitting) {
      return;
    }
    setOpen(false);
    setError(null);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(
      'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isSubmitting) {
          setOpen(false);
          setError(null);
          triggerRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isSubmitting]);

  const submit = async () => {
    if (!reason || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = buildPathVideoDismissalSubmitPayload({
        pathId,
        pathVideoId,
        youtubeVideoId,
        reason,
        broaderFeedback,
      });
      const response = await fetch(`/api/paths/${pathId}/dismissals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === 'string' && data.error
            ? data.error
            : 'Failed to exclude this video from the path'
        );
        return;
      }
      setOpen(false);
      setReason(null);
      setBroaderFeedback(false);
      await onDismissed?.();
    } catch (err) {
      console.error('path video dismiss error:', err);
      setError('Failed to exclude this video from the path');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || isSubmitting}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          setError(null);
        }}
        className="rounded-full border border-red-300/25 px-2.5 py-1 text-xs text-red-100 disabled:opacity-40"
      >
        Exclude
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#141410] p-4 shadow-lg shadow-black/40"
        >
          <p
            id={titleId}
            className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-stone-500"
          >
            Exclude from this path
          </p>
          <p className="mt-2 text-sm text-stone-300">
            {videoTitle
              ? `Remove “${videoTitle}” and keep it out when this path is rebuilt.`
              : 'Remove this video and keep it out when this path is rebuilt.'}
          </p>

          <fieldset className="mt-3 space-y-2" disabled={isSubmitting}>
            <legend className="sr-only">Exclusion reason</legend>
            {PATH_VIDEO_DISMISSAL_REASON_OPTIONS.map((option) => (
              <label
                key={option.reason}
                className="flex cursor-pointer items-start gap-2 text-sm text-stone-200"
              >
                <input
                  type="radio"
                  name={`dismiss-reason-${pathVideoId}`}
                  value={option.reason}
                  checked={reason === option.reason}
                  onChange={() => setReason(option.reason)}
                  className="mt-0.5"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={broaderFeedback}
              disabled={isSubmitting}
              onChange={(event) => setBroaderFeedback(event.target.checked)}
              className="mt-0.5"
            />
            <span>{PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL}</span>
          </label>

          {error && (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSubmitting || !reason}
              onClick={() => void submit()}
              className="rounded-full border border-red-300/30 bg-red-300/10 px-3 py-1.5 text-xs text-red-50 disabled:opacity-40"
            >
              {isSubmitting ? 'Excluding…' : 'Confirm exclude'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={close}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-stone-300 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
