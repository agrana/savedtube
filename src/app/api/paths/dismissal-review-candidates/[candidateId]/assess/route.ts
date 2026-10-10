import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { config } from '@/lib/config';
import { assessOwnedPathVideoDismissalReviewCandidate } from '@/lib/path-dismissal-assessment';
import { createOpenAiCompatibleDismissalAssessmentProvider } from '@/lib/llm-provider';
import { createServerSupabaseClient } from '@/lib/supabase';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ candidateId: string }>;
};

function createDismissalAssessmentLlm() {
  if (!config.research.modelApiKey) {
    return null;
  }
  return createOpenAiCompatibleDismissalAssessmentProvider({
    provider: config.research.modelProvider,
    model: config.research.modelName,
    apiKey: config.research.modelApiKey,
    baseUrl: config.research.modelBaseUrl,
  });
}

/**
 * Authenticated advisory assessment for the current user's own review candidate.
 * Persists provenance and status only; never activates global rules or filters.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { candidateId } = await context.params;
    const supabase = createServerSupabaseClient();
    const result = await assessOwnedPathVideoDismissalReviewCandidate(
      supabase,
      auth.session.user.id,
      candidateId,
      {
        llm: createDismissalAssessmentLlm(),
        timeoutMs: Math.min(config.research.providerTimeoutMs, 12_000),
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      candidate: result.candidate,
      assessment: result.assessment,
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      activeForPathGeneration: result.activeForPathGeneration,
    });
  } catch (error) {
    console.error(
      'POST /api/paths/dismissal-review-candidates/[candidateId]/assess error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
