'use client';

import { useState } from 'react';
import type { QuizCardQuestionPublic } from '@/lib/path-quiz';

type ReviewPhase = 'recall' | 'reveal' | 'done';

type Props = {
  pathId: string;
  cards: QuizCardQuestionPublic[];
  onRated?: () => void;
};

export default function QuizReviewPanel({ pathId, cards, onRated }: Props) {
  const [queue, setQueue] = useState(cards);
  const [phase, setPhase] = useState<ReviewPhase>('recall');
  const [rubric, setRubric] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = queue[0] || null;

  if (!current) {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 px-5 py-5">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-stone-500">
          Spaced recall
        </p>
        <p className="mt-2 text-sm text-stone-400">No reviews due right now.</p>
      </section>
    );
  }

  const reveal = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/paths/${pathId}/reviews/${current.id}/reveal`,
        { method: 'POST' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to reveal rubric');
        return;
      }
      setRubric(data.card?.answerRubric || null);
      setPhase('reveal');
    } catch (err) {
      console.error('reveal quiz error:', err);
      setError('Failed to reveal rubric');
    } finally {
      setIsBusy(false);
    }
  };

  const rate = async (rating: 'again' | 'remembered') => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/paths/${pathId}/reviews/${current.id}/rate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            expectedScheduleVersion: current.scheduleVersion,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to submit review');
        return;
      }
      setQueue((prev) => prev.slice(1));
      setPhase('recall');
      setRubric(null);
      onRated?.();
    } catch (err) {
      console.error('rate quiz error:', err);
      setError('Failed to submit review');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="rounded-[1.5rem] border border-amber-200/20 bg-amber-300/[0.05] px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-amber-100/70">
          Spaced recall · {queue.length} due
        </p>
        {current.isMetadataOnly && (
          <span className="text-xs text-stone-500">
            {current.evidenceLabel}
          </span>
        )}
      </div>
      <p className="mt-3 text-base text-stone-100">{current.question}</p>
      <p className="mt-2 text-xs text-stone-500">
        Due {new Date(current.dueAt).toISOString().slice(0, 10)} UTC
      </p>

      {phase === 'recall' && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void reveal()}
          className="mt-4 rounded-full border border-amber-200/30 bg-amber-200/15 px-4 py-2 text-sm text-amber-50 disabled:opacity-50"
        >
          {isBusy ? 'Loading…' : 'Reveal answer rubric'}
        </button>
      )}

      {phase === 'reveal' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-[#080806]/70 px-4 py-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-stone-500">
              Answer rubric
            </p>
            <p className="mt-2 text-sm text-stone-200">{rubric}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void rate('again')}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-stone-200 disabled:opacity-50"
            >
              Again
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void rate('remembered')}
              className="rounded-full border border-amber-200/30 bg-amber-200/15 px-4 py-2 text-sm text-amber-50 disabled:opacity-50"
            >
              Remembered
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
