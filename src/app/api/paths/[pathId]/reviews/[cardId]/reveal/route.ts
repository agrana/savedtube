import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pathIdSchema } from '@/lib/paths';
import { loadOwnedQuizCard, toQuizCardRevealPublic } from '@/lib/path-quiz';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ pathId: string; cardId: string }>;
};

const cardIdSchema = z.string().uuid('Invalid card ID');

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId: rawPathId, cardId: rawCardId } = await context.params;
    const pathIdResult = pathIdSchema.safeParse(rawPathId);
    const cardIdResult = cardIdSchema.safeParse(rawCardId);
    if (!pathIdResult.success || !cardIdResult.success) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const loaded = await loadOwnedQuizCard(
      supabase,
      auth.session.user.id,
      pathIdResult.data,
      cardIdResult.data
    );

    if (!loaded.ok) {
      return NextResponse.json(
        { error: loaded.error },
        { status: loaded.status }
      );
    }

    return NextResponse.json({
      card: toQuizCardRevealPublic(loaded.card),
    });
  } catch (error) {
    console.error(
      'POST /api/paths/[pathId]/reviews/[cardId]/reveal error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
