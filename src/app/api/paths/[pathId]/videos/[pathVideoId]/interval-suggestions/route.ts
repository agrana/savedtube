import { NextRequest, NextResponse } from 'next/server';
import {
  requireApiSession,
  requireApiSessionWithAccessToken,
} from '@/lib/api-auth';
import {
  generateOwnedIntervalSuggestions,
  listOwnedIntervalSuggestions,
  parseGenerateIntervalSuggestionsBody,
} from '@/lib/interval-suggestions';
import { createDefaultIntervalSuggestionDeps } from '@/lib/interval-suggestions-runtime';
import { parsePathId } from '@/lib/paths';
import { createServerSupabaseClient } from '@/lib/supabase';
import { z } from 'zod';

export const maxDuration = 90;
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ pathId: string; pathVideoId: string }>;
};

const pathVideoIdSchema = z.string().uuid('Invalid path video ID');

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId, pathVideoId } = await context.params;
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }
    const videoValidation = pathVideoIdSchema.safeParse(pathVideoId);
    if (!videoValidation.success) {
      return NextResponse.json(
        { error: 'Invalid path video ID' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await listOwnedIntervalSuggestions(
      supabase,
      auth.session.user.id,
      idValidation.data,
      videoValidation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    console.error('GET interval-suggestions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSessionWithAccessToken();
    if (auth.error) {
      return auth.error;
    }

    const { pathId, pathVideoId } = await context.params;
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }
    const videoValidation = pathVideoIdSchema.safeParse(pathVideoId);
    if (!videoValidation.success) {
      return NextResponse.json(
        { error: 'Invalid path video ID' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const validation = parseGenerateIntervalSuggestionsBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    let deps;
    try {
      deps = createDefaultIntervalSuggestionDeps(supabase);
    } catch (error) {
      console.error('Interval suggestion deps error:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Suggestion model is not configured. Research cannot run.';
      return NextResponse.json(
        {
          error: message,
          code: 'suggestions_not_configured',
        },
        { status: 503 }
      );
    }

    const result = await generateOwnedIntervalSuggestions(
      deps,
      auth.session.user.id,
      idValidation.data,
      videoValidation.data,
      auth.session.accessToken,
      validation.data.idempotencyKey
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({
      state: result.state,
      jobId: result.jobId,
      reused: result.reused,
      suggestions: result.suggestions,
      message: result.message,
    });
  } catch (error) {
    console.error('POST interval-suggestions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
