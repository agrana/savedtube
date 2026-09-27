import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { PATH_ACCESS_ERROR_CODE } from '@/lib/api-auth-errors';
import { createServerSupabaseClient } from '@/lib/supabase';
import { loadOwnedPathDetail } from '@/lib/path-research';
import {
  deleteOwnedPath,
  parsePathId,
  parseUpdatePathBody,
  updateOwnedPath,
} from '@/lib/paths';

type RouteContext = {
  params: Promise<{ pathId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await loadOwnedPathDetail(
      supabase,
      auth.session.user.id,
      idValidation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.status === 404
            ? { code: PATH_ACCESS_ERROR_CODE.PATH_NOT_FOUND }
            : {}),
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      path: result.path,
      revision: result.revision,
      stages: result.stages,
      draftRevision: result.draftRevision,
      draftStages: result.draftStages,
      latestJob: result.latestJob,
    });
  } catch (error) {
    console.error('GET /api/paths/[pathId] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const body = await request.json();
    const validation = parseUpdatePathBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await updateOwnedPath(
      supabase,
      auth.session.user.id,
      idValidation.data,
      validation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ path: result.path });
  } catch (error) {
    console.error('PATCH /api/paths/[pathId] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId } = await context.params;
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await deleteOwnedPath(
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/paths/[pathId] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
