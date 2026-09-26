import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import {
  activateOwnedPathRevision,
  parseActivateRevisionBody,
  parsePathIdParam,
} from '@/lib/path-edits';
import { loadOwnedPathDetail } from '@/lib/path-research';
import { createServerSupabaseClient } from '@/lib/supabase';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

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
    const validation = parseActivateRevisionBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await activateOwnedPathRevision(
      supabase,
      auth.session.user.id,
      idValidation.data,
      validation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          editVersion: result.editVersion ?? null,
        },
        { status: result.status }
      );
    }

    const detail = await loadOwnedPathDetail(
      supabase,
      auth.session.user.id,
      idValidation.data
    );

    return NextResponse.json({
      success: true,
      revisionId: result.revisionId,
      editVersion: result.editVersion,
      alreadyActive: result.alreadyActive,
      path: detail.ok ? detail.path : null,
      revision: detail.ok ? detail.revision : null,
      stages: detail.ok ? detail.stages : [],
      draftRevision: detail.ok ? detail.draftRevision : null,
      draftStages: detail.ok ? detail.draftStages : [],
    });
  } catch (error) {
    console.error('POST /api/paths/[pathId]/revisions/activate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
