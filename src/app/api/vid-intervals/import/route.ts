import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSessionWithAccessToken } from '@/lib/api-auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  extractChaptersFromDescription,
  parseIsoDurationToSeconds,
} from '@/lib/youtube-chapters';

const importSchema = z.object({
  videoId: z.string().min(1),
  overwrite: z.boolean().optional(),
});

type IntervalRow = {
  id: string;
  user_id: string;
  video_id: string;
  name?: string | null;
  start_time: number;
  end_time: number;
  order_index: number;
  created_at: string;
  updated_at: string;
};

const mapInterval = (item: IntervalRow) => ({
  id: item.id,
  userId: item.user_id,
  videoId: item.video_id,
  name: item.name ?? null,
  startTime: item.start_time,
  endTime: item.end_time,
  orderIndex: item.order_index,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiSessionWithAccessToken();
    if (auth.error) {
      return auth.error;
    }
    const { session } = auth;

    const body = await request.json();
    const validation = importSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { videoId, overwrite = false } = validation.data;
    const supabase = createServerSupabaseClient();

    // Scope to this video only — never touch intervals for other videos.
    const { data: existingIntervals, error: existingError } = await supabase
      .from('video_intervals')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('video_id', videoId);

    if (existingError) {
      console.error('Error checking existing intervals:', existingError);
      return NextResponse.json(
        { error: 'Failed to check existing intervals' },
        { status: 500 }
      );
    }

    const existingCount = existingIntervals?.length ?? 0;

    if (existingCount > 0 && !overwrite) {
      return NextResponse.json(
        { error: 'Intervals already exist for this video' },
        { status: 409 }
      );
    }

    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    ytUrl.searchParams.set('part', 'snippet,contentDetails');
    ytUrl.searchParams.set('id', videoId);

    const ytResponse = await fetch(ytUrl.toString(), {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!ytResponse.ok) {
      const errorText = await ytResponse.text();
      console.error('YouTube API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch YouTube video details' },
        { status: ytResponse.status }
      );
    }

    const ytData = await ytResponse.json();
    const video = ytData.items?.[0];

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const description: string = video.snippet?.description || '';
    const durationIso: string = video.contentDetails?.duration || '';
    const durationSeconds = parseIsoDurationToSeconds(durationIso);
    const parsed = extractChaptersFromDescription(description, durationSeconds);

    if (!parsed.ok) {
      return NextResponse.json({
        importedCount: 0,
        intervals: [],
        code: parsed.code,
        message:
          parsed.code === 'no_chapters'
            ? 'No chapters found in the YouTube description. You can mark practice intervals manually.'
            : parsed.message,
      });
    }

    const rows = parsed.chapters.map((chapter, index) => ({
      name: chapter.label,
      start_time: chapter.startTime,
      end_time: chapter.endTime,
      order_index: index,
    }));

    // Always use the atomic RPC so inserts are chapter_import-sourced and
    // overwrite replaces every owned row for this video only.
    const { data: replaceResult, error: replaceError } = await supabase.rpc(
      'replace_owned_video_intervals',
      {
        p_user_id: session.user.id,
        p_video_id: videoId,
        p_intervals: rows,
      }
    );

    if (replaceError) {
      console.error('Error replacing intervals:', replaceError);
      return NextResponse.json(
        { error: 'Failed to import intervals' },
        { status: 500 }
      );
    }

    const payload = replaceResult as {
      ok?: boolean;
      intervals?: IntervalRow[];
      imported_count?: number;
    };

    const inserted = payload.intervals || [];
    return NextResponse.json({
      importedCount: payload.imported_count ?? inserted.length,
      intervals: inserted.map(mapInterval),
    });
  } catch (error) {
    console.error('Error in POST /api/vid-intervals/import:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
