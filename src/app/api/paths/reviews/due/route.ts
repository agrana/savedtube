import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { listDueReviewsForOwner } from '@/lib/path-quiz';

export async function GET() {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const supabase = createServerSupabaseClient();
    const result = await listDueReviewsForOwner({
      db: supabase,
      ownerId: auth.session.user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ dueReviews: result.summaries });
  } catch (error) {
    console.error('GET /api/paths/reviews/due error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
