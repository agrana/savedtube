import { NextRequest, NextResponse } from 'next/server';
import { requireApiReviewerSession } from '@/lib/api-auth';
import {
  parsePathVideoRuleStatusUpdateBody,
  transitionPathVideoRuleStatus,
} from '@/lib/path-video-rules';
import { createServerSupabaseClient } from '@/lib/supabase';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ ruleId: string }>;
};

/**
 * Reviewer-only approve (activate) / suspend / retire via status transition.
 * Rollback is status/version based; rules are never deleted.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiReviewerSession();
    if (auth.error) {
      return auth.error;
    }

    const { ruleId } = await context.params;
    if (
      typeof ruleId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        ruleId
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid rule ID format' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const validation = parsePathVideoRuleStatusUpdateBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await transitionPathVideoRuleStatus(
      supabase,
      auth.session.user.id,
      ruleId,
      validation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      rule: result.rule,
      activeForPathGeneration: result.activeForPathGeneration,
    });
  } catch (error) {
    console.error('PATCH /api/paths/video-rules/[ruleId] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
