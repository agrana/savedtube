/** Client-safe path URL helpers (no server imports). */

export function buildPathWatchHref(
  youtubeVideoId: string,
  pathId: string,
  pathVideoId: string
): string {
  const params = new URLSearchParams({
    pathId,
    pathVideoId,
  });
  return `/watch/${youtubeVideoId}?${params.toString()}`;
}

export type PathWatchContext = {
  pathId: string;
  pathTitle: string;
  pathVideoId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string | null;
  stageId: string;
  stageTitle: string;
  practiced: boolean;
  position: number;
  total: number;
  previous: {
    pathVideoId: string;
    youtubeVideoId: string;
  } | null;
  next: {
    pathVideoId: string;
    youtubeVideoId: string;
  } | null;
  returnHref: string;
};
