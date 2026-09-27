import { NextRequest, NextResponse } from 'next/server';
import { requireApiSessionWithAccessToken } from '@/lib/api-auth';
import { config, getResearchModelNotConfiguredError } from '@/lib/config';
import { parsePathId } from '@/lib/paths';
import { PATH_ACCESS_ERROR_CODE } from '@/lib/api-auth-errors';
import {
  createDefaultResearchDeps,
  runPathResearch,
} from '@/lib/path-research';
import { parseResearchRequestBody } from '@/lib/path-research-schema';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * Vercel function duration. Next requires a static numeric literal here.
 * Keep equal to RESEARCH_DEFAULT_MAX_DURATION_SECONDS (300) and document
 * RESEARCH_MAX_DURATION_SECONDS overrides in deployment config when needed.
 */
export const maxDuration = 300;
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSessionWithAccessToken();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const validation = parseResearchRequestBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!config.research.enabled) {
      return NextResponse.json(
        {
          error: 'Path research is temporarily disabled',
          code: 'research_disabled',
        },
        { status: 503 }
      );
    }

    if (!config.research.modelApiKey) {
      const configurationError = getResearchModelNotConfiguredError();
      return NextResponse.json(
        {
          error: configurationError.message,
          code: 'research_not_configured',
        },
        { status: 503 }
      );
    }

    const supabase = createServerSupabaseClient();
    let deps;
    try {
      deps = createDefaultResearchDeps(supabase);
    } catch (error) {
      console.error('Research deps error:', error);
      const message =
        error instanceof Error
          ? error.message
          : getResearchModelNotConfiguredError().message;
      return NextResponse.json(
        {
          error: message,
          code: 'research_not_configured',
        },
        { status: 503 }
      );
    }

    const result = await runPathResearch({
      deps,
      ownerId: auth.session.user.id,
      pathId: idValidation.data,
      idempotencyKey: validation.data.idempotencyKey,
      accessToken: auth.session.accessToken,
    });

    if (!result.ok) {
      const status =
        result.code === 'youtube_quota' ||
        result.code === 'user_budget_exhausted' ||
        result.code === 'project_budget_exhausted' ||
        result.code === 'model_rate_limited'
          ? 429
          : result.status;

      // Ownership failures stay 404 with a stable code (no existence leak).
      const code =
        result.code ||
        (result.status === 404
          ? PATH_ACCESS_ERROR_CODE.PATH_NOT_FOUND
          : undefined);

      return NextResponse.json(
        {
          error: result.error,
          ...(code ? { code } : {}),
          job: result.job ?? null,
        },
        { status }
      );
    }

    return NextResponse.json({
      job: result.job,
      reused: result.reused,
      pathId: result.pathId,
      revisionId: result.revisionId,
    });
  } catch (error) {
    console.error('POST /api/paths/[pathId]/research error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
