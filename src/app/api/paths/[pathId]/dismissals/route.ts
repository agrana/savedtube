import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import {
  applyOwnedPathVideoDismissal,
  listOwnedActivePathVideoDismissals,
  parsePathVideoDismissalBody,
  parsePathVideoDismissalRestoreBody,
  restoreOwnedPathVideoDismissal,
} from '@/lib/path-dismissals';
import { parsePathId } from '@/lib/paths';
import { createServerSupabaseClient } from '@/lib/supabase';

export const runtime = 'nodejs';

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
    const result = await listOwnedActivePathVideoDismissals(
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

    return NextResponse.json({
      dismissals: result.dismissals,
    });
  } catch (error) {
    console.error('GET /api/paths/[pathId]/dismissals error:', error);
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
    const idValidation = parsePathId(pathId);
    if (!idValidation.success) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const validation = parsePathVideoDismissalBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (validation.data.pathId !== idValidation.data) {
      return NextResponse.json({ error: 'Path ID mismatch' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await applyOwnedPathVideoDismissal(
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

    return NextResponse.json({
      created: result.created,
      dismissal: result.dismissal,
    });
  } catch (error) {
    console.error('POST /api/paths/[pathId]/dismissals error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Undo an active soft-dismiss by setting undismissed_at. Idempotent. */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const body = await request.json().catch(() => null);
    const validation = parsePathVideoDismissalRestoreBody({
      ...(body && typeof body === 'object' ? body : {}),
      pathId: idValidation.data,
    });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (validation.data.pathId !== idValidation.data) {
      return NextResponse.json({ error: 'Path ID mismatch' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const result = await restoreOwnedPathVideoDismissal(
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

    return NextResponse.json({
      restored: result.restored,
      dismissal: result.dismissal,
    });
  } catch (error) {
    console.error('DELETE /api/paths/[pathId]/dismissals error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
