import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase';

const importSchema = z.object({
  videoId: z.string().min(1),
  overwrite: z.boolean().optional(),
});

const parseIsoDurationToSeconds = (duration: string): number | null => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = Number.parseInt(match[1] || '0', 10);
  const minutes = Number.parseInt(match[2] || '0', 10);
  const seconds = Number.parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
};

const parseTimestampToSeconds = (timestamp: string): number | null => {
  const parts = timestamp.split(':').map((value) => Number.parseInt(value, 10));
  if (parts.some((value) => Number.isNaN(value))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
};

const extractIntervalsFromDescription = (
  description: string,
  durationSeconds: number | null
) => {
  const lines = description.split('\n');
  const entries: { startTime: number }[] = [];

  for (const line of lines) {
    const match = line.match(/(^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$)/);
    if (!match) continue;

    const startTime = parseTimestampToSeconds(match[2]);
    if (startTime === null) continue;
    if (durationSeconds !== null && startTime >= durationSeconds) continue;

    entries.push({ startTime });
  }

  const sorted = entries
    .sort((a, b) => a.startTime - b.startTime)
    .filter((entry, index, array) => {
      if (index === 0) return true;
      return entry.startTime !== array[index - 1].startTime;
    });

  const intervals: { startTime: number; endTime: number }[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const startTime = sorted[i].startTime;
    const nextStart = sorted[i + 1]?.startTime;
    const endTime = nextStart ?? durationSeconds ?? null;

    if (endTime === null) continue;
    if (endTime <= startTime) continue;

    intervals.push({ startTime, endTime });
  }

  return intervals;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const { data: existingIntervals, error: existingError } = await supabase
      .from('video_intervals')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('video_id', videoId)
      .limit(1);

    if (existingError) {
      console.error('Error checking existing intervals:', existingError);
      return NextResponse.json(
        { error: 'Failed to check existing intervals' },
        { status: 500 }
      );
    }

    const existingIds = (existingIntervals || []).map(
      (interval) => interval.id
    );

    if (existingIds.length > 0 && !overwrite) {
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

    const intervals = extractIntervalsFromDescription(
      description,
      durationSeconds
    );

    if (intervals.length === 0) {
      return NextResponse.json({ importedCount: 0, intervals: [] });
    }

    const rows = intervals.map((interval, index) => ({
      user_id: session.user.id,
      video_id: videoId,
      start_time: interval.startTime,
      end_time: interval.endTime,
      order_index: index,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('video_intervals')
      .insert(rows)
      .select();

    if (insertError) {
      console.error('Error inserting intervals:', insertError);
      return NextResponse.json(
        { error: 'Failed to import intervals' },
        { status: 500 }
      );
    }

    const mapped = (inserted || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      videoId: item.video_id,
      startTime: item.start_time,
      endTime: item.end_time,
      orderIndex: item.order_index,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    let warning: string | undefined;

    if (overwrite && existingIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('video_intervals')
        .delete()
        .in('id', existingIds);

      if (deleteError) {
        console.error('Error deleting existing intervals:', deleteError);
        warning =
          'Imported new intervals, but failed to remove existing intervals.';
      }
    }

    return NextResponse.json({
      importedCount: mapped.length,
      intervals: mapped,
      warning,
    });
  } catch (error) {
    console.error('Error in POST /api/vid-intervals/import:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
