/**
 * YouTube description chapter parsing for practice intervals.
 * Labels are preserved; timestamps must satisfy 0 <= start < end <= duration.
 */

export type ParsedChapter = {
  label: string;
  startTime: number;
  endTime: number;
};

export type ChapterParseResult =
  | { ok: true; chapters: ParsedChapter[]; durationSeconds: number }
  | {
      ok: false;
      code: 'no_chapters' | 'missing_duration' | 'malformed';
      message: string;
      chapters: ParsedChapter[];
    };

const TIMESTAMP_PATTERN = /(?:^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$)/;

/** Parse M:SS / MM:SS / H:MM:SS chapter timestamps into seconds. */
export function parseChapterTimestampToSeconds(
  timestamp: string
): number | null {
  const parts = timestamp.split(':').map((value) => Number.parseInt(value, 10));
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  if (parts.some((value) => Number.isNaN(value) || value < 0)) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (seconds >= 60) {
      return null;
    }
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = parts;
  if (minutes >= 60 || seconds >= 60) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/** Parse ISO-8601 duration (PT#H#M#S) used by YouTube contentDetails.duration. */
export function parseIsoDurationToSeconds(
  duration: string | null | undefined
): number | null {
  if (!duration) {
    return null;
  }
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1] || '0', 10);
  const minutes = Number.parseInt(match[2] || '0', 10);
  const seconds = Number.parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function extractLabel(line: string, timestamp: string): string {
  const withoutTimestamp = line
    .replace(timestamp, ' ')
    .replace(/^[\s\-–—|:·•*]+/, '')
    .replace(/[\s\-–—|:·•*]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutTimestamp.length > 0
    ? withoutTimestamp.slice(0, 100)
    : 'Chapter';
}

type RawChapterStart = {
  label: string;
  startTime: number;
};

/**
 * Extract ordered chapter spans from a YouTube video description.
 * Requires a known non-negative duration so end bounds are always valid.
 */
export function extractChaptersFromDescription(
  description: string,
  durationSeconds: number | null | undefined
): ChapterParseResult {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return {
      ok: false,
      code: 'missing_duration',
      message: 'Video duration is required to build chapter intervals',
      chapters: [],
    };
  }

  const duration = Math.floor(durationSeconds);
  const lines = description.split(/\r?\n/);
  const entries: RawChapterStart[] = [];

  for (const line of lines) {
    const match = TIMESTAMP_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const timestamp = match[1];
    const startTime = parseChapterTimestampToSeconds(timestamp);
    if (startTime === null) {
      continue;
    }
    if (startTime < 0 || startTime > duration) {
      continue;
    }

    entries.push({
      label: extractLabel(line, timestamp),
      startTime,
    });
  }

  if (entries.length === 0) {
    return {
      ok: false,
      code: 'no_chapters',
      message: 'No chapters found in the YouTube description',
      chapters: [],
    };
  }

  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  const deduped: RawChapterStart[] = [];
  for (const entry of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.startTime === entry.startTime) {
      continue;
    }
    deduped.push(entry);
  }

  const chapters: ParsedChapter[] = [];
  for (let index = 0; index < deduped.length; index += 1) {
    const startTime = deduped[index].startTime;
    const nextStart = deduped[index + 1]?.startTime;
    const endTime = nextStart ?? duration;

    if (!(startTime >= 0 && startTime < endTime && endTime <= duration)) {
      continue;
    }

    chapters.push({
      label: deduped[index].label,
      startTime,
      endTime,
    });
  }

  if (chapters.length === 0) {
    return {
      ok: false,
      code: 'malformed',
      message: 'Chapter timestamps could not form valid intervals',
      chapters: [],
    };
  }

  // Chapters must be strictly increasing by start time.
  for (let index = 1; index < chapters.length; index += 1) {
    if (chapters[index].startTime <= chapters[index - 1].startTime) {
      return {
        ok: false,
        code: 'malformed',
        message: 'Chapter timestamps are not in ascending order',
        chapters: [],
      };
    }
  }

  return { ok: true, chapters, durationSeconds: duration };
}

/**
 * Validate that a span exactly matches a known chapter (no invented finer bounds).
 */
export function findKnownChapterSpan(
  chapters: ReadonlyArray<ParsedChapter>,
  startTime: number,
  endTime: number
): ParsedChapter | null {
  return (
    chapters.find(
      (chapter) =>
        chapter.startTime === startTime && chapter.endTime === endTime
    ) ?? null
  );
}
