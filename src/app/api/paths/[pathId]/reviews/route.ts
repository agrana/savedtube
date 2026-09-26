import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pathIdSchema } from '@/lib/paths';
import { listDueReviewsForPath } from '@/lib/path-quiz';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId: rawPathId } = await context.params;
    const pathIdResult = pathIdSchema.safeParse(rawPathId);
    if (!pathIdResult.success) {
      return NextResponse.json({ error: 'Invalid path ID' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await listDueReviewsForPath({
      db: supabase,
      ownerId: auth.session.user.id,
      pathId: pathIdResult.data,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      pathId: pathIdResult.data,
      pathTitle: result.pathTitle,
      activeRevisionId: result.activeRevisionId,
      dueReviews: result.due,
      dueCount: result.due.length,
    });
  } catch (error) {
    console.error('GET /api/paths/[pathId]/reviews error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
