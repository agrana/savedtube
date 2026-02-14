import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { extractYouTubeVideoId } from '@/lib/validation';

const sortModes = [
  'custom',
  'date_desc',
  'date_asc',
  'alpha_asc',
  'alpha_desc',
] as const;

type SortMode = (typeof sortModes)[number];

const getPlaylistItemsSchema = z.object({
  playlistId: z.string().min(1, 'Playlist ID is required'),
  sort: z.enum(sortModes).optional(),
});

const videoIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid video ID format');

const playlistEditActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('remove'),
    playlistId: z.string().min(1),
    videoId: videoIdSchema,
  }),
  z.object({
    action: z.literal('reorder'),
    playlistId: z.string().min(1),
    orderedVideoIds: z.array(videoIdSchema).min(1),
  }),
  z.object({
    action: z.literal('add'),
    playlistId: z.string().min(1),
    url: z.string().min(1),
  }),
]);

interface PlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
    channelTitle: string;
    publishedAt: string;
  };
  contentDetails: {
    videoId: string;
  };
}

interface RawPlaylistItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
    channelTitle?: string;
    publishedAt?: string;
  };
  contentDetails?: {
    videoId?: string;
  };
}

interface RawVideoResource {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
    channelTitle?: string;
    publishedAt?: string;
  };
}

interface PlaylistItemEdit {
  video_id: string;
  custom_order: number | null;
  removed: boolean;
  added_by_user: boolean;
}

function normalizeThumbnails(thumbnails?: {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
  standard?: { url?: string };
  maxres?: { url?: string };
}) {
  const fallback =
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    '';

  return {
    default: { url: thumbnails?.default?.url || fallback },
    medium: { url: thumbnails?.medium?.url || fallback },
    high: { url: thumbnails?.high?.url || fallback },
  };
}

function normalizePlaylistItem(item: RawPlaylistItem): PlaylistItem | null {
  const videoId = item.contentDetails?.videoId;

  if (!videoId) {
    return null;
  }

  return {
    id: item.id || videoId,
    snippet: {
      title: item.snippet?.title || 'Untitled video',
      description: item.snippet?.description || '',
      thumbnails: normalizeThumbnails(item.snippet?.thumbnails),
      channelTitle: item.snippet?.channelTitle || 'Unknown Channel',
      publishedAt: item.snippet?.publishedAt || '',
    },
    contentDetails: {
      videoId,
    },
  };
}

function playlistItemFromVideo(video: RawVideoResource): PlaylistItem | null {
  if (!video.id) {
    return null;
  }

  return {
    id: `manual-${video.id}`,
    snippet: {
      title: video.snippet?.title || 'Untitled video',
      description: video.snippet?.description || '',
      thumbnails: normalizeThumbnails(video.snippet?.thumbnails),
      channelTitle: video.snippet?.channelTitle || 'Unknown Channel',
      publishedAt: video.snippet?.publishedAt || '',
    },
    contentDetails: {
      videoId: video.id,
    },
  };
}

function compareByDate(a: string, b: string, ascending: boolean) {
  const aTime = Date.parse(a || '');
  const bTime = Date.parse(b || '');
  const safeATime = Number.isNaN(aTime) ? 0 : aTime;
  const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
  return ascending ? safeATime - safeBTime : safeBTime - safeATime;
}

function sortPlaylistItems(
  items: PlaylistItem[],
  sortMode: SortMode,
  editMap: Map<string, PlaylistItemEdit>
) {
  const defaultOrder = new Map(
    items.map((item, index) => [item.contentDetails.videoId, index])
  );

  return [...items].sort((a, b) => {
    const videoA = a.contentDetails.videoId;
    const videoB = b.contentDetails.videoId;

    if (sortMode === 'date_desc') {
      return compareByDate(a.snippet.publishedAt, b.snippet.publishedAt, false);
    }

    if (sortMode === 'date_asc') {
      return compareByDate(a.snippet.publishedAt, b.snippet.publishedAt, true);
    }

    if (sortMode === 'alpha_asc') {
      return a.snippet.title.localeCompare(b.snippet.title);
    }

    if (sortMode === 'alpha_desc') {
      return b.snippet.title.localeCompare(a.snippet.title);
    }

    const customOrderA = editMap.get(videoA)?.custom_order;
    const customOrderB = editMap.get(videoB)?.custom_order;

    const hasCustomA = typeof customOrderA === 'number';
    const hasCustomB = typeof customOrderB === 'number';

    if (hasCustomA && hasCustomB) {
      return customOrderA - customOrderB;
    }

    if (hasCustomA) {
      return -1;
    }

    if (hasCustomB) {
      return 1;
    }

    return (defaultOrder.get(videoA) ?? 0) - (defaultOrder.get(videoB) ?? 0);
  });
}

async function fetchYouTubePlaylistItems(
  accessToken: string,
  playlistId: string,
  pageToken = ''
) {
  const baseUrl = 'https://www.googleapis.com/youtube/v3/playlistItems';
  const params = new URLSearchParams({
    part: 'id,snippet,contentDetails',
    playlistId,
    maxResults: '50',
  });

  if (pageToken) {
    params.append('pageToken', pageToken);
  }

  const url = `${baseUrl}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorText: await response.text(),
      data: null,
    };
  }

  const data = await response.json();
  return { ok: true, status: 200, errorText: '', data };
}

async function fetchYouTubeVideosByIds(accessToken: string, videoIds: string[]) {
  const uniqueIds = [...new Set(videoIds)];
  const allItems: RawVideoResource[] = [];

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);

    const baseUrl = 'https://www.googleapis.com/youtube/v3/videos';
    const params = new URLSearchParams({
      part: 'id,snippet',
      id: batch.join(','),
      maxResults: '50',
    });

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        errorText: await response.text(),
        items: [],
      };
    }

    const data = await response.json();
    allItems.push(...(data.items || []));
  }

  return { ok: true, status: 200, errorText: '', items: allItems };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validation = getPlaylistItemsSchema.safeParse({
      playlistId: searchParams.get('playlistId'),
      sort: searchParams.get('sort') || undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const playlistId = validation.data.playlistId;
    const sortMode = validation.data.sort || 'custom';
    const pageToken = searchParams.get('pageToken') || '';

    const supabase = createServerSupabaseClient();

    const [youtubeResult, editsResult] = await Promise.all([
      fetchYouTubePlaylistItems(session.accessToken, playlistId, pageToken),
      supabase
        .from('playlist_item_edits')
        .select('video_id,custom_order,removed,added_by_user')
        .eq('user_id', session.user.id)
        .eq('playlist_id', playlistId),
    ]);

    if (!youtubeResult.ok) {
      console.error('YouTube playlist fetch error:', youtubeResult.errorText);
      return NextResponse.json(
        { error: 'Failed to fetch playlist items' },
        { status: youtubeResult.status }
      );
    }

    if (editsResult.error) {
      console.error('Playlist edits fetch error:', editsResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch playlist edits' },
        { status: 500 }
      );
    }

    const editMap = new Map<string, PlaylistItemEdit>();
    for (const edit of editsResult.data || []) {
      editMap.set(edit.video_id, edit);
    }

    const youtubeItems = ((youtubeResult.data?.items || []) as RawPlaylistItem[])
      .map(normalizePlaylistItem)
      .filter((item): item is PlaylistItem => item !== null)
      .filter((item) => !editMap.get(item.contentDetails.videoId)?.removed);

    const existingVideoIds = new Set(
      youtubeItems.map((item) => item.contentDetails.videoId)
    );

    const addedVideoIds = (editsResult.data || [])
      .filter(
        (edit) =>
          edit.added_by_user && !edit.removed && !existingVideoIds.has(edit.video_id)
      )
      .map((edit) => edit.video_id);

    let addedItems: PlaylistItem[] = [];

    if (addedVideoIds.length > 0) {
      const addedVideosResult = await fetchYouTubeVideosByIds(
        session.accessToken,
        addedVideoIds
      );

      if (!addedVideosResult.ok) {
        console.error('YouTube videos fetch error:', addedVideosResult.errorText);
        return NextResponse.json(
          { error: 'Failed to fetch added videos' },
          { status: addedVideosResult.status }
        );
      }

      const addedItemsMap = new Map<string, PlaylistItem>();
      for (const rawVideo of addedVideosResult.items) {
        const playlistItem = playlistItemFromVideo(rawVideo);
        if (playlistItem) {
          addedItemsMap.set(playlistItem.contentDetails.videoId, playlistItem);
        }
      }

      addedItems = addedVideoIds
        .map((videoId) => addedItemsMap.get(videoId))
        .filter((item): item is PlaylistItem => item !== undefined);
    }

    const mergedItems = [...youtubeItems, ...addedItems];
    const sortedItems = sortPlaylistItems(mergedItems, sortMode, editMap);

    return NextResponse.json({
      items: sortedItems,
      sort: sortMode,
      nextPageToken: youtubeResult.data?.nextPageToken,
      pageInfo: youtubeResult.data?.pageInfo,
    });
  } catch (error) {
    console.error('Error fetching playlist items:', error);
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
    const validation = playlistEditActionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    if (validation.data.action === 'remove') {
      const { playlistId, videoId } = validation.data;

      const { error } = await supabase.from('playlist_item_edits').upsert(
        {
          user_id: session.user.id,
          playlist_id: playlistId,
          video_id: videoId,
          removed: true,
        },
        {
          onConflict: 'user_id,playlist_id,video_id',
        }
      );

      if (error) {
        console.error('Remove playlist item error:', error);
        return NextResponse.json(
          { error: 'Failed to remove video from playlist view' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (validation.data.action === 'reorder') {
      const { playlistId, orderedVideoIds } = validation.data;
      const deduped = [...new Set(orderedVideoIds)];

      if (deduped.length !== orderedVideoIds.length) {
        return NextResponse.json(
          { error: 'orderedVideoIds contains duplicates' },
          { status: 400 }
        );
      }

      const rows = deduped.map((videoId, index) => ({
        user_id: session.user.id,
        playlist_id: playlistId,
        video_id: videoId,
        custom_order: index,
      }));

      const { error } = await supabase
        .from('playlist_item_edits')
        .upsert(rows, { onConflict: 'user_id,playlist_id,video_id' });

      if (error) {
        console.error('Reorder playlist items error:', error);
        return NextResponse.json(
          { error: 'Failed to save custom order' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    const { playlistId, url } = validation.data;

    if (!session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube video URL' },
        { status: 400 }
      );
    }

    const videosResult = await fetchYouTubeVideosByIds(session.accessToken, [videoId]);
    if (!videosResult.ok) {
      console.error('YouTube add video fetch error:', videosResult.errorText);
      return NextResponse.json(
        { error: 'Failed to validate video URL' },
        { status: videosResult.status }
      );
    }

    const video = videosResult.items[0];
    if (!video) {
      return NextResponse.json(
        { error: 'Video not found or unavailable' },
        { status: 404 }
      );
    }

    const playlistItem = playlistItemFromVideo(video);

    if (!playlistItem) {
      return NextResponse.json(
        { error: 'Video not found or unavailable' },
        { status: 404 }
      );
    }

    const { data: maxCustomOrderData, error: maxOrderError } = await supabase
      .from('playlist_item_edits')
      .select('custom_order')
      .eq('user_id', session.user.id)
      .eq('playlist_id', playlistId)
      .not('custom_order', 'is', null)
      .order('custom_order', { ascending: false })
      .limit(1);

    if (maxOrderError) {
      console.error('Fetch max custom order error:', maxOrderError);
      return NextResponse.json(
        { error: 'Failed to compute insertion order' },
        { status: 500 }
      );
    }

    const nextCustomOrder =
      maxCustomOrderData && maxCustomOrderData.length > 0
        ? (maxCustomOrderData[0].custom_order as number) + 1
        : 0;

    const { error: upsertError } = await supabase.from('playlist_item_edits').upsert(
      {
        user_id: session.user.id,
        playlist_id: playlistId,
        video_id: videoId,
        added_by_user: true,
        removed: false,
        custom_order: nextCustomOrder,
      },
      {
        onConflict: 'user_id,playlist_id,video_id',
      }
    );

    if (upsertError) {
      console.error('Add playlist item error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to add video to playlist view' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      item: playlistItem,
    });
  } catch (error) {
    console.error('Error editing playlist items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
