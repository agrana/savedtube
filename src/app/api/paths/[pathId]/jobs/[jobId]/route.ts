import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { getOwnedPathJob } from '@/lib/path-research';
import { parsePathId } from '@/lib/paths';
import { createServerSupabaseClient } from '@/lib/supabase';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ pathId: string; jobId: string }>;
};

const jobIdSchema = z.string().uuid('Invalid job ID format');

/**
 * Owned job-status endpoint. Polling is visibility only — the research POST
 * awaits the work; this does not start model calls.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { pathId, jobId } = await context.params;
    const pathValidation = parsePathId(pathId);
    if (!pathValidation.success) {
      return NextResponse.json(
        { error: pathValidation.error },
        { status: 400 }
      );
    }

    const jobValidation = jobIdSchema.safeParse(jobId);
    if (!jobValidation.success) {
      return NextResponse.json(
        { error: jobValidation.error.errors[0]?.message || 'Invalid job ID' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await getOwnedPathJob(
      supabase,
      auth.session.user.id,
      pathValidation.data,
      jobValidation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ job: result.job });
  } catch (error) {
    console.error('GET /api/paths/[pathId]/jobs/[jobId] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
