import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  createOwnedPath,
  listOwnedPaths,
  parseCreatePathBody,
  parsePathListQuery,
} from '@/lib/paths';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const queryValidation = parsePathListQuery({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!queryValidation.success) {
      return NextResponse.json(
        { error: queryValidation.error },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await listOwnedPaths(
      supabase,
      auth.session.user.id,
      queryValidation.data
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('GET /api/paths error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiSession();
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();
    const validation = parseCreatePathBody(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Owner is always derived from the session — never from the client body.
    const supabase = createServerSupabaseClient();
    const result = await createOwnedPath(
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

    return NextResponse.json({ path: result.path }, { status: 201 });
  } catch (error) {
    console.error('POST /api/paths error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
