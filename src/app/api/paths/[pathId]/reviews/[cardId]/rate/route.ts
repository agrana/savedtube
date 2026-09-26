import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pathIdSchema } from '@/lib/paths';
import {
  parseSubmitQuizReviewBody,
  submitOwnedQuizReview,
} from '@/lib/path-quiz';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ pathId: string; cardId: string }>;
};

const cardIdSchema = z.string().uuid('Invalid card ID');

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json().catch(() => null);
    const validation = parseSubmitQuizReviewBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await submitOwnedQuizReview({
      db: supabase,
      ownerId: auth.session.user.id,
      pathId: pathIdResult.data,
      cardId: cardIdResult.data,
      rating: validation.data.rating,
      expectedScheduleVersion: validation.data.expectedScheduleVersion,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      created: result.created,
      card: result.question,
      attempt: result.attempt,
    });
  } catch (error) {
    console.error(
      'POST /api/paths/[pathId]/reviews/[cardId]/rate error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
