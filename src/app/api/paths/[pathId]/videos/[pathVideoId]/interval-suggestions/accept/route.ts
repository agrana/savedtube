import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import {
  acceptOwnedIntervalSuggestions,
  parseAcceptIntervalSuggestionsBody,
} from '@/lib/interval-suggestions';
import { parsePathId } from '@/lib/paths';
import { createServerSupabaseClient } from '@/lib/supabase';
import { z } from 'zod';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ pathId: string; pathVideoId: string }>;
};

const pathVideoIdSchema = z.string().uuid('Invalid path video ID');

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json().catch(() => null);
    const validation = parseAcceptIntervalSuggestionsBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await acceptOwnedIntervalSuggestions(
      supabase,
      auth.session.user.id,
      idValidation.data,
      videoValidation.data,
      validation.data.suggestionIds
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({
      accepted: result.accepted,
      preservedManualCount: result.preservedManualCount,
    });
  } catch (error) {
    console.error('POST accept interval-suggestions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
