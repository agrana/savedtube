import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { config } from '@/lib/config';
import { createOpenAiCompatibleFollowUpProvider } from '@/lib/llm-provider';
import { parsePathIdParam } from '@/lib/path-edits';
import {
  applyOwnedPathProgress,
  loadOwnedPathProgress,
  parsePathProgressBody,
} from '@/lib/path-progress';
import { createServerSupabaseClient } from '@/lib/supabase';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

function createFollowUpLlm() {
  if (!config.research.modelApiKey) {
    return null;
  }
  return createOpenAiCompatibleFollowUpProvider({
    provider: config.research.modelProvider,
    model: config.research.modelName,
    apiKey: config.research.modelApiKey,
    baseUrl: config.research.modelBaseUrl,
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathIdParam(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await loadOwnedPathProgress(
      supabase,
      auth.session.user.id,
      idValidation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ progress: result.summary });
  } catch (error) {
    console.error('GET /api/paths/[pathId]/progress error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathIdParam(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const validation = parsePathProgressBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await applyOwnedPathProgress(
      supabase,
      auth.session.user.id,
      idValidation.data,
      validation.data,
      new Date(),
      validation.data.action === 'complete_stage'
        ? {
            llm: createFollowUpLlm(),
            followUpTimeoutMs: Math.min(
              config.research.providerTimeoutMs,
              12_000
            ),
          }
        : {}
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      progress: result.summary,
      followUp: result.followUp ?? null,
      followUpCreated: result.followUpCreated ?? false,
    });
  } catch (error) {
    console.error('POST /api/paths/[pathId]/progress error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
