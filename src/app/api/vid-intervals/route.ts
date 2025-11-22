import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { z } from 'zod';

// Validation schema for creating an interval
const createIntervalSchema = z.object({
  videoId: z.string().min(1),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('video_intervals')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('video_id', videoId)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching intervals:', error);
      return NextResponse.json(
        { error: 'Failed to fetch intervals' },
        { status: 500 }
      );
    }

    // Map database fields to frontend model
    const intervals = (data || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      videoId: item.video_id,
      startTime: item.start_time,
      endTime: item.end_time,
      orderIndex: item.order_index,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return NextResponse.json({ intervals });
  } catch (error) {
    console.error('Error in GET /api/vid-intervals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createIntervalSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { videoId, startTime, endTime } = validation.data;

    if (endTime <= startTime) {
      return NextResponse.json(
        { error: 'End time must be greater than start time' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Get current max order index
    const { data: maxOrderData } = await supabase
      .from('video_intervals')
      .select('order_index')
      .eq('user_id', session.user.id)
      .eq('video_id', videoId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrderIndex =
      maxOrderData && maxOrderData.length > 0
        ? maxOrderData[0].order_index + 1
        : 0;

    const { data, error } = await supabase
      .from('video_intervals')
      .insert({
        user_id: session.user.id,
        video_id: videoId,
        start_time: startTime,
        end_time: endTime,
        order_index: nextOrderIndex,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating interval:', error);
      return NextResponse.json(
        { error: 'Failed to create interval' },
        { status: 500 }
      );
    }

    // Map to frontend model
    const interval = {
      id: data.id,
      userId: data.user_id,
      videoId: data.video_id,
      startTime: data.start_time,
      endTime: data.end_time,
      orderIndex: data.order_index,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ interval }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/vid-intervals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
