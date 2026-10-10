import { NextRequest, NextResponse } from 'next/server';
import { requireApiReviewerSession } from '@/lib/api-auth';
import {
  listPathVideoRules,
  parsePathVideoRuleProposalBody,
  PATH_VIDEO_RULE_STATUSES,
  proposePathVideoRule,
  type PathVideoRuleStatus,
} from '@/lib/path-video-rules';
import { createServerSupabaseClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Reviewer-only listing of executable path video rules.
 * Does not apply rules to path generation.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiReviewerSession();
    if (auth.error) {
      return auth.error;
    }

    const statusParam = request.nextUrl.searchParams.get('status');
    let status: PathVideoRuleStatus | undefined;
    if (statusParam != null && statusParam.length > 0) {
      if (
        !(PATH_VIDEO_RULE_STATUSES as readonly string[]).includes(statusParam)
      ) {
        return NextResponse.json(
          { error: 'Invalid status filter' },
          { status: 400 }
        );
      }
      status = statusParam as PathVideoRuleStatus;
    }

    const supabase = createServerSupabaseClient();
    const result = await listPathVideoRules(supabase, { status });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ rules: result.rules });
  } catch (error) {
    console.error('GET /api/paths/video-rules error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Reviewer-only structured rule proposal. Creates a draft by default.
 * Activates only when activate=true is explicitly set by the allowlisted
 * reviewer. Never activates from LLM assessment output alone.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiReviewerSession();
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json().catch(() => null);
    const validation = parsePathVideoRuleProposalBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await proposePathVideoRule(
      supabase,
      auth.session.user.id,
      validation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      {
        created: result.created,
        rule: result.rule,
        activeForPathGeneration: result.activeForPathGeneration,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/paths/video-rules error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
