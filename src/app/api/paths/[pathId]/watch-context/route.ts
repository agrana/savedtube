import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api-auth';
import { parsePathIdParam } from '@/lib/path-edits';
import { loadOwnedPathWatchContext } from '@/lib/path-watch';
import { createServerSupabaseClient } from '@/lib/supabase';
import { youtubeVideoIdSchema } from '@/lib/path-research-schema';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

const watchQuerySchema = z.object({
  pathVideoId: z.string().uuid('Invalid path video ID'),
  videoId: youtubeVideoIdSchema,
});

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathIdParam(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const query = watchQuerySchema.safeParse({
      pathVideoId: request.nextUrl.searchParams.get('pathVideoId'),
      videoId: request.nextUrl.searchParams.get('videoId'),
    });
    if (!query.success) {
      return NextResponse.json(
        { error: query.error.errors[0]?.message || 'Invalid query' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await loadOwnedPathWatchContext(
      supabase,
      auth.session.user.id,
      idValidation.data,
      query.data.pathVideoId,
      query.data.videoId
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ context: result.context });
  } catch (error) {
    console.error('GET /api/paths/[pathId]/watch-context error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
