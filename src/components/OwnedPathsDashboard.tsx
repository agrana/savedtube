'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import Logo from '@/components/Logo';
import type { PathRecord } from '@/lib/paths';
import type { DueReviewSummary } from '@/lib/path-quiz';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; paths: PathRecord[] };

/**
 * Authenticated dashboard: lists owned paths and links to path creation.
 */
export default function OwnedPathsDashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [dueReviews, setDueReviews] = useState<DueReviewSummary[]>([]);

  const fetchDueReviews = useCallback(async () => {
    try {
      const response = await fetch('/api/paths/reviews/due');
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setDueReviews((data.dueReviews || []) as DueReviewSummary[]);
    } catch (error) {
      console.error('Error loading due reviews:', error);
    }
  }, []);

  const fetchPaths = useCallback(async () => {
    setListState({ status: 'loading' });
    try {
      const response = await fetch('/api/paths?page=1&limit=50');
      if (response.status === 401) {
        setListState({
          status: 'error',
          message: 'Please sign in to view your paths.',
        });
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load paths');
      }
      const data = await response.json();
      const paths = (data.paths || []) as PathRecord[];
      if (paths.length === 0) {
        setListState({ status: 'empty' });
      } else {
        setListState({ status: 'ready', paths });
      }
      void fetchDueReviews();
    } catch (error) {
      console.error('Error loading paths:', error);
      setListState({
        status: 'error',
        message: 'Failed to load your paths. Try again.',
      });
    }
  }, [fetchDueReviews]);

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      void fetchPaths();
    }
    if (sessionStatus === 'unauthenticated') {
      setListState({
        status: 'error',
        message: 'Please sign in to view your paths.',
      });
    }
  }, [sessionStatus, fetchPaths]);

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-amber-200" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center px-5">
        <div className="rounded-[2rem] border border-white/10 bg-[#10100d]/90 p-8 text-center shadow-2xl shadow-black/50">
          <h1 className="text-2xl font-medium tracking-[-0.03em] text-stone-50 mb-4">
            Access Denied
          </h1>
          <p className="text-stone-400">
            Please sign in to view your learning paths.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080806] text-stone-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_55%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[1px] w-[78vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <nav className="relative z-10 border-b border-white/[0.06] bg-[#080806]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Logo size="lg" variant="white" showText={true} />
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-amber-100/80 sm:inline-flex">
              Paths
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-3 sm:flex">
              {session.user?.image && (
                <Image
                  className="h-8 w-8 rounded-full border border-white/10"
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={32}
                  height={32}
                />
              )}
              <span className="max-w-36 truncate text-sm font-medium text-stone-300">
                {session.user?.name}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-stone-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="mb-9 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-100/70">
              Your learning studio
            </p>
            <h1 className="mt-4 text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-5xl">
              Your paths
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-400">
              Open a path to continue, or create a new one from a learning goal.
            </p>
          </div>
          <Link
            href="/paths/new"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white"
          >
            Create new path
          </Link>
        </section>

        <section>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-medium tracking-[-0.03em] text-stone-100">
              Existing paths
            </h2>
            <button
              type="button"
              onClick={() => void fetchPaths()}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-300 transition hover:bg-white/[0.06] hover:text-stone-100"
            >
              Refresh
            </button>
          </div>

          {dueReviews.length > 0 && (
            <div className="mb-6 rounded-[1.5rem] border border-amber-200/20 bg-amber-300/[0.05] px-5 py-4">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-amber-100/70">
                Spaced recall due
              </p>
              <ul className="mt-3 space-y-2">
                {dueReviews.map((item) => (
                  <li key={item.pathId}>
                    <Link
                      href={`/paths/${item.pathId}#spaced-recall`}
                      className="flex items-center justify-between gap-3 text-sm text-stone-200 transition hover:text-amber-50"
                    >
                      <span className="truncate">{item.pathTitle}</span>
                      <span className="shrink-0 font-mono text-xs text-amber-100/70">
                        {item.dueCount} due
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {listState.status === 'loading' && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-200" />
            </div>
          )}

          {listState.status === 'error' && (
            <div className="rounded-[1.5rem] border border-red-300/20 bg-[#10100d]/90 px-6 py-10 text-center">
              <h3 className="text-lg font-medium text-red-100 mb-2">
                Could not load paths
              </h3>
              <p className="text-red-200/80">{listState.message}</p>
              <button
                type="button"
                onClick={() => void fetchPaths()}
                className="mt-5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-200 transition hover:bg-white/[0.06]"
              >
                Try again
              </button>
            </div>
          )}

          {listState.status === 'empty' && (
            <div className="rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 px-6 py-14 text-center">
              <h3 className="text-lg font-medium text-stone-100 mb-2">
                No paths yet
              </h3>
              <p className="text-stone-400">
                Create your first path from a learning goal. Research runs once
                after save.
              </p>
              <Link
                href="/paths/new"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white"
              >
                Create new path
              </Link>
            </div>
          )}

          {listState.status === 'ready' && (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {listState.paths.map((path) => (
                <li key={path.id}>
                  <Link
                    href={`/paths/${path.id}`}
                    className="block rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-5 shadow-2xl shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:border-amber-200/25"
                  >
                    <h3 className="line-clamp-2 font-medium tracking-[-0.02em] text-stone-100">
                      {path.display_path || path.title}
                    </h3>
                    <p className="mt-3 line-clamp-2 text-sm text-stone-400">
                      {path.display_objective}
                    </p>
                    <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-amber-100/60">
                      Updated{' '}
                      {new Date(path.updated_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {dueReviews.find((item) => item.pathId === path.id)
                        ? ` · ${
                            dueReviews.find((item) => item.pathId === path.id)
                              ?.dueCount
                          } reviews due`
                        : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
