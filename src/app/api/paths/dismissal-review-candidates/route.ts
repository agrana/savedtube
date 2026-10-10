import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { listOwnedPathVideoDismissalReviewCandidates } from '@/lib/path-dismissal-review-candidates';
import { createServerSupabaseClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Authenticated transparency listing of the current user's own broader-feedback
 * review candidates. Does not expose other users' feedback or activate rules.
 */
export async function GET() {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const supabase = createServerSupabaseClient();
    const result = await listOwnedPathVideoDismissalReviewCandidates(
      supabase,
      auth.session.user.id
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      candidates: result.candidates,
    });
  } catch (error) {
    console.error('GET /api/paths/dismissal-review-candidates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
