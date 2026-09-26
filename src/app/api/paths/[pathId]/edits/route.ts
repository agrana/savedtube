import { NextRequest, NextResponse } from 'next/server';
import {
  requireApiSession,
  requireApiSessionWithAccessToken,
} from '@/lib/api-auth';
import {
  applyOwnedPathEdit,
  parsePathEditBody,
  parsePathIdParam,
  resolveYouTubeVideoIdFromUrl,
} from '@/lib/path-edits';
import { loadOwnedPathDetail } from '@/lib/path-research';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createYouTubeDataClient } from '@/lib/youtube-data';
import { config } from '@/lib/config';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { pathId } = await context.params;
    const idValidation = parsePathIdParam(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const validation = parsePathEditBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const action = validation.data;
    const needsYouTube = action.action === 'add' || action.action === 'replace';

    const auth = needsYouTube
      ? await requireApiSessionWithAccessToken()
      : await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const supabase = createServerSupabaseClient();
    let verifiedVideo:
      | {
          youtubeVideoId: string;
          title: string;
          channelTitle: string | null;
          durationSeconds: number | null;
          thumbnailUrl: string | null;
          verifiedAt: string;
          metadataSnapshot: Record<string, unknown> | null;
        }
      | undefined;

    if (
      needsYouTube &&
      (action.action === 'add' || action.action === 'replace')
    ) {
      const resolved = resolveYouTubeVideoIdFromUrl(action.url);
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }

      const youtube = createYouTubeDataClient();
      const details = await youtube.fetchVideoDetails({
        accessToken: auth.session.accessToken as string,
        videoIds: [resolved.videoId],
        timeoutMs: config.research.youtubeTimeoutMs,
      });

      if (!details.ok) {
        const status =
          details.code === 'youtube_quota'
            ? 429
            : details.status && details.status >= 400 && details.status < 600
              ? details.status
              : 502;
        return NextResponse.json(
          {
            error:
              details.code === 'youtube_quota'
                ? 'YouTube quota exceeded. Try again later.'
                : 'Failed to validate video URL',
            code: details.code,
          },
          { status }
        );
      }

      const candidate = details.candidates[0];
      if (!candidate) {
        return NextResponse.json(
          { error: 'Video not found or unavailable' },
          { status: 404 }
        );
      }

      verifiedVideo = {
        youtubeVideoId: candidate.youtubeVideoId,
        title: candidate.title,
        channelTitle: candidate.channelTitle,
        durationSeconds: candidate.durationSeconds,
        thumbnailUrl: candidate.thumbnailUrl ?? null,
        verifiedAt: new Date().toISOString(),
        metadataSnapshot: {
          channelTitle: candidate.channelTitle,
          durationSeconds: candidate.durationSeconds,
        },
      };
    }

    const result = await applyOwnedPathEdit(
      supabase,
      auth.session.user.id,
      idValidation.data,
      action,
      verifiedVideo
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    const detail = await loadOwnedPathDetail(
      supabase,
      auth.session.user.id,
      idValidation.data
    );

    return NextResponse.json({
      success: true,
      editVersion: result.editVersion,
      revisionId: result.revisionId,
      pathVideoId: result.pathVideoId ?? null,
      revision: detail.ok ? detail.revision : null,
      stages: detail.ok ? detail.stages : [],
    });
  } catch (error) {
    console.error('POST /api/paths/[pathId]/edits error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
