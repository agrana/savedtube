'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import PathMap from '@/components/PathMap';
import QuizReviewPanel from '@/components/QuizReviewPanel';
import {
  isYouTubeReauthErrorCode,
  YOUTUBE_REAUTH_REQUIRED_MESSAGE,
} from '@/lib/api-auth-errors';
import type { PathRecord } from '@/lib/paths';
import type {
  PathJobPublicView,
  PathRevisionRecord,
  PathStageWithVideos,
} from '@/lib/path-research-schema';
import type { PathProgressSummary } from '@/lib/path-progress';
import { buildPathWatchHref } from '@/lib/path-links';

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not_found' }
  | {
      status: 'ready';
      path: PathRecord;
      revision: PathRevisionRecord | null;
      stages: PathStageWithVideos[];
      draftRevision: PathRevisionRecord | null;
      draftStages: PathStageWithVideos[];
      latestJob: PathJobPublicView | null;
      progress: PathProgressSummary | null;
    };

function researchFailureMessage(
  job: PathJobPublicView | null,
  fallback?: string | null
) {
  if (fallback) {
    return fallback;
  }
  if (!job) {
    return null;
  }
  if (job.status === 'succeeded') {
    return null;
  }
  if (job.errorMessage) {
    return job.errorMessage;
  }
  switch (job.errorCode) {
    case 'no_candidates':
      return 'No playable YouTube videos matched this path. Try refining the goal or background.';
    case 'youtube_quota':
      return 'YouTube search quota is exhausted. Try again later.';
    case 'user_budget_exhausted':
    case 'project_budget_exhausted':
      return 'Research budget is exhausted for today.';
    case 'deadline_exceeded':
    case 'model_timeout':
    case 'youtube_timeout':
      return 'Research timed out before finishing. Your saved goal is intact — retry when ready.';
    case 'partial_coverage':
      return (
        job.resultSummary || 'Some stages had no matches and were omitted.'
      );
    default:
      if (job.status === 'failed' || job.status === 'interrupted') {
        return 'Research did not complete. Your saved goal is still available.';
      }
      return null;
  }
}

function researchIdempotencyStorageKey(pathId: string): string {
  return `savedtube:research-idempotency:${pathId}`;
}

export default function PathDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathId = params.pathId as string;
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [addUrlByStage, setAddUrlByStage] = useState<Record<string, string>>(
    {}
  );
  const [replaceUrlByVideo, setReplaceUrlByVideo] = useState<
    Record<string, string>
  >({});
  const [researchBanner, setResearchBanner] = useState<string | null>(null);
  const [needsYouTubeReconnect, setNeedsYouTubeReconnect] = useState(false);
  const [isReconnectingYouTube, setIsReconnectingYouTube] = useState(false);
  const [queryResearchStatus, setQueryResearchStatus] = useState<string | null>(
    null
  );
  const [reflectingStageId, setReflectingStageId] = useState<string | null>(
    null
  );
  const [reflectionDraftByStage, setReflectionDraftByStage] = useState<
    Record<string, string>
  >({});
  const [isCompletingStage, setIsCompletingStage] = useState(false);

  const fetchPath = useCallback(async () => {
    if (!pathId) {
      setPageState({ status: 'not_found' });
      return;
    }

    setPageState({ status: 'loading' });
    try {
      const [pathResponse, progressResponse] = await Promise.all([
        fetch(`/api/paths/${pathId}`),
        fetch(`/api/paths/${pathId}/progress`),
      ]);

      if (pathResponse.status === 401) {
        setPageState({
          status: 'error',
          message: 'Please sign in to view this path.',
        });
        return;
      }
      if (pathResponse.status === 404) {
        setPageState({ status: 'not_found' });
        return;
      }
      if (!pathResponse.ok) {
        throw new Error('Failed to load path');
      }
      const data = await pathResponse.json();
      let progress: PathProgressSummary | null = null;
      if (progressResponse.ok) {
        const progressData = await progressResponse.json();
        progress = (progressData.progress as PathProgressSummary) || null;
      }

      setPageState({
        status: 'ready',
        path: data.path as PathRecord,
        revision: (data.revision as PathRevisionRecord | null) || null,
        stages: (data.stages || []) as PathStageWithVideos[],
        draftRevision:
          (data.draftRevision as PathRevisionRecord | null) || null,
        draftStages: (data.draftStages || []) as PathStageWithVideos[],
        latestJob: (data.latestJob as PathJobPublicView | null) || null,
        progress,
      });
    } catch (error) {
      console.error('Error loading path:', error);
      setPageState({
        status: 'error',
        message: 'Failed to load this path. Try again.',
      });
    }
  }, [pathId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const researchError = params.get('researchError');
    const researchErrorCode = params.get('researchErrorCode');
    const researchStatus = params.get('researchStatus');
    if (researchError) {
      setResearchBanner(researchError);
    }
    if (isYouTubeReauthErrorCode(researchErrorCode)) {
      setNeedsYouTubeReconnect(true);
      if (!researchError) {
        setResearchBanner(YOUTUBE_REAUTH_REQUIRED_MESSAGE);
      }
    }
    if (researchStatus) {
      setQueryResearchStatus(researchStatus);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      void fetchPath();
    }
    if (sessionStatus === 'unauthenticated') {
      setPageState({
        status: 'error',
        message: 'Please sign in to view this path.',
      });
    }
  }, [sessionStatus, fetchPath]);

  const handleDelete = async () => {
    if (!pathId || isDeleting) {
      return;
    }
    const confirmed = window.confirm(
      'Delete this path? Stages, videos, and research jobs for this path will be removed. Shared practice loops on videos are kept.'
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/paths/${pathId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete path');
      }
      router.push('/paths');
    } catch (error) {
      console.error('Error deleting path:', error);
      setPageState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to delete path',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResearch = async () => {
    if (!pathId || isResearching) {
      return;
    }
    setIsResearching(true);
    setResearchBanner(null);
    setNeedsYouTubeReconnect(false);
    setEditError(null);

    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      sessionStorage.setItem(researchIdempotencyStorageKey(pathId), key);
    } catch {
      // ignore
    }

    try {
      const response = await fetch(`/api/paths/${pathId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: key }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && isYouTubeReauthErrorCode(data.code)) {
          setNeedsYouTubeReconnect(true);
          setResearchBanner(
            typeof data.error === 'string' && data.error
              ? data.error
              : YOUTUBE_REAUTH_REQUIRED_MESSAGE
          );
        } else {
          setResearchBanner(
            data.error ||
              researchFailureMessage(data.job || null) ||
              'Research failed'
          );
        }
      } else if (data.job?.status === 'partial') {
        setResearchBanner(
          researchFailureMessage(data.job) ||
            'Research saved with partial coverage.'
        );
      } else if (data.job?.resultSummary) {
        setResearchBanner(data.job.resultSummary);
      }
      await fetchPath();
    } catch (error) {
      console.error('Error researching path:', error);
      setResearchBanner('Research failed. Your saved path is still available.');
    } finally {
      setIsResearching(false);
    }
  };

  const handleReconnectYouTube = async () => {
    if (!pathId || isReconnectingYouTube) {
      return;
    }
    setIsReconnectingYouTube(true);
    const callbackUrl = `/paths/${pathId}`;
    try {
      // Explicit user action only — do not auto-redirect on mount (avoids loops).
      await signOut({ redirect: false });
      await signIn('google', { callbackUrl });
    } catch (error) {
      console.error('Error reconnecting Google YouTube auth:', error);
      setResearchBanner(YOUTUBE_REAUTH_REQUIRED_MESSAGE);
      setIsReconnectingYouTube(false);
    }
  };

  const applyEdit = async (body: Record<string, unknown>) => {
    if (!pathId || isApplyingEdit) {
      return;
    }
    setIsApplyingEdit(true);
    setEditError(null);
    setEditMessage(null);
    try {
      const response = await fetch(`/api/paths/${pathId}/edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply edit');
      }
      // Map and editable list both consume this same stages/revision payload.
      setPageState((prev) => {
        if (prev.status !== 'ready') {
          return prev;
        }
        return {
          ...prev,
          revision:
            (data.revision as PathRevisionRecord | null | undefined) ??
            prev.revision,
          stages: Array.isArray(data.stages)
            ? (data.stages as PathStageWithVideos[])
            : prev.stages,
        };
      });
      setEditMessage('Path updated.');

      const progressResponse = await fetch(`/api/paths/${pathId}/progress`);
      if (progressResponse.ok) {
        const progressData = await progressResponse.json().catch(() => ({}));
        setPageState((prev) => {
          if (prev.status !== 'ready') {
            return prev;
          }
          return {
            ...prev,
            progress:
              (progressData.progress as PathProgressSummary | null) || null,
          };
        });
      }
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Failed to apply edit'
      );
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const handleActivateDraft = async () => {
    if (
      pageState.status !== 'ready' ||
      !pageState.draftRevision ||
      !pageState.revision
    ) {
      return;
    }
    setIsActivating(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/paths/${pathId}/revisions/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revisionId: pageState.draftRevision.id,
          expectedEditVersion: pageState.revision.edit_version,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to activate draft');
      }
      setEditMessage(
        'Draft revision is now active. Progress starts unpracticed.'
      );
      await fetchPath();
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Failed to activate draft'
      );
    } finally {
      setIsActivating(false);
    }
  };

  const updateProgress = async (body: Record<string, unknown>) => {
    if (!pathId) {
      return;
    }
    try {
      if (body.action === 'complete_stage') {
        setIsCompletingStage(true);
      }
      const response = await fetch(`/api/paths/${pathId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update progress');
      }
      if (body.action === 'complete_stage') {
        setReflectingStageId(null);
        setEditMessage('Stage completed. Follow-up is saved for this version.');
      }
      await fetchPath();
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Failed to update progress'
      );
    } finally {
      setIsCompletingStage(false);
    }
  };

  const failureFromJob = useMemo(() => {
    if (pageState.status !== 'ready') {
      return null;
    }
    return researchFailureMessage(pageState.latestJob, researchBanner);
  }, [pageState, researchBanner]);

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
          <p className="text-stone-400">Please sign in to view this path.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080806] text-stone-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_55%)]" />

      <nav className="relative z-10 border-b border-white/[0.06] bg-[#080806]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Logo size="lg" variant="white" showText={true} />
            <Link
              href="/paths"
              className="text-sm text-stone-400 transition hover:text-stone-100"
            >
              ← Paths
            </Link>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-stone-50"
            >
              Saved playlists
            </Link>
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
        {pageState.status === 'loading' && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-200" />
          </div>
        )}

        {pageState.status === 'error' && (
          <div className="rounded-[1.5rem] border border-red-300/20 bg-[#10100d]/90 px-6 py-10 text-center">
            <h1 className="text-2xl font-medium text-red-100 mb-3">Error</h1>
            <p className="text-red-200/80">{pageState.message}</p>
          </div>
        )}

        {pageState.status === 'not_found' && (
          <div className="rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 px-6 py-14 text-center">
            <h1 className="text-2xl font-medium text-stone-100 mb-3">
              Path not found
            </h1>
            <p className="text-stone-400 mb-6">
              This path does not exist or you do not have access to it.
            </p>
            <Link
              href="/paths"
              className="inline-flex rounded-full bg-stone-100 px-5 py-2.5 text-sm font-medium text-stone-950 transition hover:bg-white"
            >
              Back to paths
            </Link>
          </div>
        )}

        {pageState.status === 'ready' && (
          <>
            <section className="mb-10 max-w-3xl">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-100/70">
                Learning path
              </p>
              <h1 className="mt-4 text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-5xl">
                {pageState.path.title}
              </h1>

              <div className="mt-8 space-y-5 rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-5 sm:p-6">
                <div>
                  <h2 className="text-sm font-medium text-stone-300">Goal</h2>
                  <p className="mt-2 whitespace-pre-wrap text-stone-100">
                    {pageState.path.goal}
                  </p>
                </div>
                <div>
                  <h2 className="text-sm font-medium text-stone-300">
                    Background
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap text-stone-400">
                    {pageState.path.background?.trim()
                      ? pageState.path.background
                      : 'No background provided.'}
                  </p>
                </div>
                {pageState.progress && pageState.progress.totalVideos > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-stone-300">
                      Progress
                    </h2>
                    <p className="mt-2 text-sm text-stone-400">
                      {pageState.progress.practicedCount} of{' '}
                      {pageState.progress.totalVideos} practiced
                    </p>
                    {pageState.progress.continueTarget && (
                      <Link
                        href={buildPathWatchHref(
                          pageState.progress.continueTarget.youtubeVideoId,
                          pathId,
                          pageState.progress.continueTarget.pathVideoId
                        )}
                        className="mt-3 inline-flex rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white"
                      >
                        Continue
                      </Link>
                    )}
                  </div>
                )}
                {pageState.latestJob && (
                  <div>
                    <h2 className="text-sm font-medium text-stone-300">
                      Research status
                    </h2>
                    <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-amber-100/70">
                      {pageState.latestJob.status}
                      {pageState.latestJob.phase
                        ? ` · ${pageState.latestJob.phase}`
                        : ''}
                      {queryResearchStatus
                        ? ` · last request ${queryResearchStatus}`
                        : ''}
                    </p>
                    {pageState.latestJob.resultSummary && (
                      <p className="mt-2 text-sm text-stone-400">
                        {pageState.latestJob.resultSummary}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {failureFromJob && (
                <div
                  className="mt-5 rounded-[1.25rem] border border-amber-200/20 bg-amber-200/5 px-5 py-4 text-sm text-amber-50/90"
                  role="status"
                >
                  <p>{failureFromJob}</p>
                  {needsYouTubeReconnect && (
                    <button
                      type="button"
                      onClick={() => void handleReconnectYouTube()}
                      disabled={isReconnectingYouTube}
                      className="mt-3 inline-flex rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:opacity-60"
                    >
                      {isReconnectingYouTube
                        ? 'Reconnecting...'
                        : 'Reconnect Google YouTube'}
                    </button>
                  )}
                </div>
              )}

              {(editError || editMessage) && (
                <div
                  className={`mt-5 rounded-[1.25rem] px-5 py-4 text-sm ${
                    editError
                      ? 'border border-red-300/20 bg-red-300/5 text-red-100'
                      : 'border border-emerald-300/20 bg-emerald-300/5 text-emerald-50'
                  }`}
                  role="status"
                >
                  {editError || editMessage}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                {pageState.stages.length === 0 && (
                  <button
                    type="button"
                    onClick={() => void handleResearch()}
                    disabled={isResearching}
                    className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:opacity-60"
                  >
                    {isResearching
                      ? 'Researching...'
                      : pageState.latestJob &&
                          (pageState.latestJob.status === 'failed' ||
                            pageState.latestJob.status === 'interrupted')
                        ? 'Retry research'
                        : 'Research path'}
                  </button>
                )}
                {pageState.stages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleResearch()}
                    disabled={isResearching}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    {isResearching ? 'Regenerating...' : 'Regenerate draft'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="rounded-full border border-red-300/25 bg-red-300/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-300/15 disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Delete path'}
                </button>
              </div>
            </section>

            {pageState.draftRevision && (
              <section className="mb-8 rounded-[1.5rem] border border-amber-200/20 bg-amber-200/5 p-5 sm:p-6">
                <h2 className="text-lg font-medium tracking-[-0.02em] text-amber-50">
                  Draft revision {pageState.draftRevision.revision_number}
                </h2>
                <p className="mt-2 text-sm text-amber-50/80">
                  Preview the regenerated sequence, then activate it explicitly.
                  The live path and its progress stay intact until you activate.
                </p>
                <ol className="mt-4 space-y-3">
                  {pageState.draftStages.map((stage) => (
                    <li key={stage.id} className="text-sm text-stone-200">
                      <span className="font-medium">{stage.title}</span>
                      <span className="text-stone-500">
                        {' '}
                        · {stage.videos.length} video
                        {stage.videos.length === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleActivateDraft()}
                    disabled={isActivating || !pageState.revision}
                    className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:opacity-60"
                  >
                    {isActivating ? 'Activating...' : 'Activate draft'}
                  </button>
                </div>
              </section>
            )}

            {(pageState.progress?.dueReviews?.length || 0) > 0 && (
              <section id="spaced-recall" className="mb-8">
                <QuizReviewPanel
                  pathId={pathId}
                  cards={pageState.progress?.dueReviews || []}
                  onRated={() => void fetchPath()}
                />
              </section>
            )}

            <section className="mb-8 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-xl font-medium tracking-[-0.03em] text-stone-100">
                  Path map
                  {pageState.revision
                    ? ` · revision ${pageState.revision.revision_number}`
                    : ''}
                  {pageState.revision
                    ? ` · edit v${pageState.revision.edit_version}`
                    : ''}
                </h2>
              </div>
              <PathMap
                pathId={pathId}
                pathTitle={pageState.path.title}
                goal={pageState.path.goal}
                stages={pageState.stages}
                practicedVideoIds={pageState.progress?.practicedVideoIds || []}
                completedStageIds={pageState.progress?.completedStageIds || []}
                selectedPathVideoId={
                  pageState.progress?.continueTarget?.pathVideoId || null
                }
                listHeading="Accessible path sequence"
              />
            </section>

            {pageState.stages.length === 0 ? (
              <section className="rounded-[1.5rem] border border-dashed border-white/15 bg-[#10100d]/60 px-6 py-14 text-center">
                <h2 className="text-xl font-medium tracking-[-0.03em] text-stone-100">
                  Empty path
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-stone-400">
                  No stages yet. Research builds a stored sequence of real
                  videos. Reloading this page does not call a model.
                </p>
              </section>
            ) : (
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-xl font-medium tracking-[-0.03em] text-stone-100">
                    Edit sequence
                  </h2>
                </div>
                <ol className="space-y-4">
                  {pageState.stages.map((stage, stageIndex) => {
                    const stageCompleted =
                      pageState.progress?.completedStageIds.includes(
                        stage.id
                      ) || false;
                    const stageFollowUp =
                      pageState.progress?.followUps?.find(
                        (item) => item.pathStageId === stage.id
                      ) || null;
                    const isReflecting = reflectingStageId === stage.id;
                    return (
                      <li
                        key={stage.id}
                        className="rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-5 sm:p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-3">
                              <span className="font-mono text-xs uppercase tracking-[0.2em] text-amber-100/60">
                                Stage {stage.position + 1}
                              </span>
                              <input
                                className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-lg font-medium tracking-[-0.02em] text-stone-50 outline-none focus:border-amber-200/30"
                                defaultValue={stage.title}
                                disabled={isApplyingEdit || !pageState.revision}
                                onBlur={(event) => {
                                  const nextTitle = event.target.value.trim();
                                  if (
                                    !pageState.revision ||
                                    !nextTitle ||
                                    nextTitle === stage.title
                                  ) {
                                    return;
                                  }
                                  void applyEdit({
                                    action: 'rename_stage',
                                    stageId: stage.id,
                                    title: nextTitle,
                                    expectedEditVersion:
                                      pageState.revision.edit_version,
                                  });
                                }}
                              />
                            </div>
                            <p className="mt-3 text-sm text-stone-300">
                              {stage.learning_objective}
                            </p>
                            <p className="mt-2 text-sm text-stone-500">
                              {stage.reason}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                isApplyingEdit ||
                                !pageState.revision ||
                                stageIndex === 0
                              }
                              onClick={() => {
                                if (!pageState.revision) return;
                                const ids = pageState.stages.map(
                                  (item) => item.id
                                );
                                const next = [...ids];
                                [next[stageIndex - 1], next[stageIndex]] = [
                                  next[stageIndex],
                                  next[stageIndex - 1],
                                ];
                                void applyEdit({
                                  action: 'reorder_stages',
                                  orderedStageIds: next,
                                  expectedEditVersion:
                                    pageState.revision.edit_version,
                                });
                              }}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-stone-300 disabled:opacity-40"
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              disabled={
                                isApplyingEdit ||
                                !pageState.revision ||
                                stageIndex >= pageState.stages.length - 1
                              }
                              onClick={() => {
                                if (!pageState.revision) return;
                                const ids = pageState.stages.map(
                                  (item) => item.id
                                );
                                const next = [...ids];
                                [next[stageIndex], next[stageIndex + 1]] = [
                                  next[stageIndex + 1],
                                  next[stageIndex],
                                ];
                                void applyEdit({
                                  action: 'reorder_stages',
                                  orderedStageIds: next,
                                  expectedEditVersion:
                                    pageState.revision.edit_version,
                                });
                              }}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-stone-300 disabled:opacity-40"
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              disabled={
                                Boolean(stageFollowUp) || isCompletingStage
                              }
                              onClick={() => setReflectingStageId(stage.id)}
                              className="rounded-full border border-amber-200/25 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-50 disabled:opacity-50"
                            >
                              {stageFollowUp
                                ? 'Completed'
                                : stageCompleted
                                  ? 'Refresh follow-up'
                                  : 'Mark completed'}
                            </button>
                          </div>
                        </div>

                        {isReflecting && !stageFollowUp && (
                          <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-300/[0.06] px-4 py-4">
                            <p className="text-sm font-medium text-amber-50">
                              Optional reflection
                            </p>
                            <p className="mt-1 text-sm text-stone-400">
                              What did you understand or practice? Skip if you
                              prefer — completion still saves a follow-up.
                            </p>
                            <textarea
                              value={reflectionDraftByStage[stage.id] || ''}
                              onChange={(event) =>
                                setReflectionDraftByStage((current) => ({
                                  ...current,
                                  [stage.id]: event.target.value,
                                }))
                              }
                              maxLength={2000}
                              rows={3}
                              placeholder="I practiced…"
                              className="mt-3 w-full rounded-xl border border-white/10 bg-[#080806]/80 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-200/30"
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={isCompletingStage}
                                onClick={() =>
                                  void updateProgress({
                                    action: 'complete_stage',
                                    stageId: stage.id,
                                    reflection:
                                      reflectionDraftByStage[
                                        stage.id
                                      ]?.trim() || null,
                                  })
                                }
                                className="rounded-full border border-amber-200/30 bg-amber-200/15 px-3 py-1.5 text-xs text-amber-50 disabled:opacity-50"
                              >
                                {isCompletingStage
                                  ? 'Saving…'
                                  : 'Save completion'}
                              </button>
                              <button
                                type="button"
                                disabled={isCompletingStage}
                                onClick={() =>
                                  void updateProgress({
                                    action: 'complete_stage',
                                    stageId: stage.id,
                                  })
                                }
                                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-stone-300 disabled:opacity-50"
                              >
                                Skip reflection
                              </button>
                              <button
                                type="button"
                                disabled={isCompletingStage}
                                onClick={() => setReflectingStageId(null)}
                                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-stone-500 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {stageFollowUp && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-stone-500">
                              Follow-up · {stageFollowUp.source}
                            </p>
                            <p className="mt-2 text-sm text-stone-200">
                              {stageFollowUp.practicedSummary}
                            </p>
                            <p className="mt-3 text-sm text-stone-300">
                              {stageFollowUp.encouragement}
                            </p>
                            <p className="mt-3 text-sm text-amber-50/90">
                              {stageFollowUp.nextStep}
                            </p>
                            {stageFollowUp.reflection && (
                              <p className="mt-3 text-sm text-stone-500">
                                Your reflection: {stageFollowUp.reflection}
                              </p>
                            )}
                          </div>
                        )}

                        <ul className="mt-5 space-y-3">
                          {stage.videos.map((video, videoIndex) => {
                            const practiced =
                              pageState.progress?.practicedVideoIds.includes(
                                video.id
                              ) || false;
                            return (
                              <li
                                key={video.id}
                                className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <Link
                                    href={buildPathWatchHref(
                                      video.youtube_video_id,
                                      pathId,
                                      video.id
                                    )}
                                    className="min-w-0 flex-1 transition hover:text-amber-50"
                                  >
                                    <p className="font-medium text-stone-100">
                                      {video.title}
                                      {practiced ? ' · practiced' : ''}
                                    </p>
                                    <p className="mt-1 text-sm text-stone-500">
                                      {video.channel_title || 'YouTube'}
                                    </p>
                                    <p className="mt-2 text-sm text-stone-400">
                                      {video.selection_reason}
                                    </p>
                                  </Link>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={
                                        isApplyingEdit ||
                                        !pageState.revision ||
                                        videoIndex === 0
                                      }
                                      onClick={() => {
                                        if (!pageState.revision) return;
                                        const ids = stage.videos.map(
                                          (item) => item.id
                                        );
                                        const next = [...ids];
                                        [
                                          next[videoIndex - 1],
                                          next[videoIndex],
                                        ] = [
                                          next[videoIndex],
                                          next[videoIndex - 1],
                                        ];
                                        void applyEdit({
                                          action: 'reorder_items',
                                          stageId: stage.id,
                                          orderedPathVideoIds: next,
                                          expectedEditVersion:
                                            pageState.revision.edit_version,
                                        });
                                      }}
                                      className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-stone-300 disabled:opacity-40"
                                    >
                                      Up
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        isApplyingEdit ||
                                        !pageState.revision ||
                                        videoIndex >= stage.videos.length - 1
                                      }
                                      onClick={() => {
                                        if (!pageState.revision) return;
                                        const ids = stage.videos.map(
                                          (item) => item.id
                                        );
                                        const next = [...ids];
                                        [
                                          next[videoIndex],
                                          next[videoIndex + 1],
                                        ] = [
                                          next[videoIndex + 1],
                                          next[videoIndex],
                                        ];
                                        void applyEdit({
                                          action: 'reorder_items',
                                          stageId: stage.id,
                                          orderedPathVideoIds: next,
                                          expectedEditVersion:
                                            pageState.revision.edit_version,
                                        });
                                      }}
                                      className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-stone-300 disabled:opacity-40"
                                    >
                                      Down
                                    </button>
                                    {stageIndex > 0 && pageState.revision && (
                                      <button
                                        type="button"
                                        disabled={isApplyingEdit}
                                        onClick={() => {
                                          if (!pageState.revision) return;
                                          void applyEdit({
                                            action: 'move_item',
                                            pathVideoId: video.id,
                                            targetStageId:
                                              pageState.stages[stageIndex - 1]
                                                .id,
                                            expectedEditVersion:
                                              pageState.revision.edit_version,
                                          });
                                        }}
                                        className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-stone-300 disabled:opacity-40"
                                      >
                                        To prev stage
                                      </button>
                                    )}
                                    {stageIndex < pageState.stages.length - 1 &&
                                      pageState.revision && (
                                        <button
                                          type="button"
                                          disabled={isApplyingEdit}
                                          onClick={() => {
                                            if (!pageState.revision) return;
                                            void applyEdit({
                                              action: 'move_item',
                                              pathVideoId: video.id,
                                              targetStageId:
                                                pageState.stages[stageIndex + 1]
                                                  .id,
                                              expectedEditVersion:
                                                pageState.revision.edit_version,
                                            });
                                          }}
                                          className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-stone-300 disabled:opacity-40"
                                        >
                                          To next stage
                                        </button>
                                      )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateProgress({
                                          action: 'mark_practiced',
                                          pathVideoId: video.id,
                                          practiced: !practiced,
                                        })
                                      }
                                      className="rounded-full border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-50"
                                    >
                                      {practiced ? 'Unmark' : 'Practiced'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        isApplyingEdit || !pageState.revision
                                      }
                                      onClick={() => {
                                        if (!pageState.revision) return;
                                        if (
                                          !window.confirm(
                                            'Remove this video from the path?'
                                          )
                                        ) {
                                          return;
                                        }
                                        void applyEdit({
                                          action: 'remove_item',
                                          pathVideoId: video.id,
                                          expectedEditVersion:
                                            pageState.revision.edit_version,
                                        });
                                      }}
                                      className="rounded-full border border-red-300/25 px-2.5 py-1 text-xs text-red-100 disabled:opacity-40"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <form
                                  className="mt-3 flex flex-wrap gap-2"
                                  onSubmit={(event: FormEvent) => {
                                    event.preventDefault();
                                    if (!pageState.revision) return;
                                    const url =
                                      replaceUrlByVideo[video.id]?.trim() || '';
                                    if (!url) return;
                                    void applyEdit({
                                      action: 'replace',
                                      pathVideoId: video.id,
                                      url,
                                      expectedEditVersion:
                                        pageState.revision.edit_version,
                                    }).then(() => {
                                      setReplaceUrlByVideo((prev) => ({
                                        ...prev,
                                        [video.id]: '',
                                      }));
                                    });
                                  }}
                                >
                                  <input
                                    value={replaceUrlByVideo[video.id] || ''}
                                    onChange={(event) =>
                                      setReplaceUrlByVideo((prev) => ({
                                        ...prev,
                                        [video.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Replace with YouTube URL"
                                    className="min-w-[14rem] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-200/30"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      isApplyingEdit || !pageState.revision
                                    }
                                    className="rounded-full border border-white/10 px-3 py-2 text-xs text-stone-200 disabled:opacity-40"
                                  >
                                    Replace
                                  </button>
                                </form>
                              </li>
                            );
                          })}
                        </ul>

                        <form
                          className="mt-4 flex flex-wrap gap-2"
                          onSubmit={(event: FormEvent) => {
                            event.preventDefault();
                            if (!pageState.revision) return;
                            const url = addUrlByStage[stage.id]?.trim() || '';
                            if (!url) return;
                            void applyEdit({
                              action: 'add',
                              stageId: stage.id,
                              url,
                              expectedEditVersion:
                                pageState.revision.edit_version,
                            }).then(() => {
                              setAddUrlByStage((prev) => ({
                                ...prev,
                                [stage.id]: '',
                              }));
                            });
                          }}
                        >
                          <input
                            value={addUrlByStage[stage.id] || ''}
                            onChange={(event) =>
                              setAddUrlByStage((prev) => ({
                                ...prev,
                                [stage.id]: event.target.value,
                              }))
                            }
                            placeholder="Add YouTube URL to this stage"
                            className="min-w-[14rem] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-200/30"
                          />
                          <button
                            type="submit"
                            disabled={isApplyingEdit || !pageState.revision}
                            className="rounded-full border border-white/10 px-3 py-2 text-xs text-stone-200 disabled:opacity-40"
                          >
                            Add video
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
