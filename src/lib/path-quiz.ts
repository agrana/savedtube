import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PathStageWithVideos } from './path-research-schema';
import { getOwnedPath } from './paths';

export const QUIZ_PROMPT_VERSION = 'stage-quiz-v1';
export const QUIZ_SCHEMA_VERSION = 'stage-quiz-v1';

/** First due is +1 day; Remembered then advances through 3 / 7 / 14 / 30. */
export const QUIZ_INITIAL_DUE_DAYS = 1;
export const QUIZ_REMEMBERED_INTERVAL_DAYS = [3, 7, 14, 30] as const;
export const QUIZ_AGAIN_RESET_DAYS = 1;
export const QUIZ_MAX_SCHEDULE_VERSION = 4;

export const QUIZ_METADATA_ONLY_LABEL = 'General topic practice';
export const QUIZ_QUESTION_MAX_LENGTH = 2000;
export const QUIZ_RUBRIC_MAX_LENGTH = 4000;
export const QUIZ_MAX_CARDS_PER_STAGE = 3;

export type QuizReviewState = 'new' | 'relearning' | 'review';
export type QuizRating = 'again' | 'remembered';

export type QuizCardRecord = {
  id: string;
  owner: string;
  path_id: string;
  path_stage_id: string;
  revision_id: string;
  completion_version: number;
  card_index: number;
  question: string;
  answer_rubric: string;
  evidence_basis: string;
  evidence_label: string;
  is_metadata_only: boolean;
  schedule_version: number;
  due_at: string;
  review_state: QuizReviewState;
  created_at: string;
  updated_at: string;
};

export type QuizReviewAttemptRecord = {
  id: string;
  owner: string;
  quiz_card_id: string;
  path_id: string;
  path_stage_id: string;
  revision_id: string;
  rating: QuizRating;
  schedule_version_before: number;
  schedule_version_after: number;
  due_at_before: string;
  due_at_after: string;
  review_state_after: QuizReviewState;
  reviewed_at: string;
  created_at: string;
};

/** Public question payload — never includes answer_rubric. */
export type QuizCardQuestionPublic = {
  id: string;
  pathId: string;
  pathStageId: string;
  revisionId: string;
  completionVersion: number;
  cardIndex: number;
  question: string;
  evidenceBasis: string;
  evidenceLabel: string;
  isMetadataOnly: boolean;
  scheduleVersion: number;
  dueAt: string;
  reviewState: QuizReviewState;
  createdAt: string;
  updatedAt: string;
};

export type QuizCardRevealPublic = QuizCardQuestionPublic & {
  answerRubric: string;
};

export type QuizReviewAttemptPublic = {
  id: string;
  quizCardId: string;
  pathId: string;
  pathStageId: string;
  revisionId: string;
  rating: QuizRating;
  scheduleVersionBefore: number;
  scheduleVersionAfter: number;
  dueAtBefore: string;
  dueAtAfter: string;
  reviewStateAfter: QuizReviewState;
  reviewedAt: string;
  createdAt: string;
};

export type QuizEvidence = {
  stageTitle: string;
  learningObjective: string;
  videoTitles: string[];
  reflection: string | null;
  goal: string;
};

export type GeneratedQuizCard = {
  card_index: number;
  question: string;
  answer_rubric: string;
  evidence_basis: string;
  evidence_label: string;
  is_metadata_only: boolean;
};

export type DueReviewSummary = {
  pathId: string;
  pathTitle: string;
  dueCount: number;
  cards: QuizCardQuestionPublic[];
};

const uuidSchema = z.string().uuid('Invalid ID format');

export const submitQuizReviewSchema = z.object({
  rating: z.enum(['again', 'remembered']),
  expectedScheduleVersion: z.number().int().min(0),
});

export function parseSubmitQuizReviewBody(body: unknown) {
  const result = submitQuizReviewSchema.safeParse(body);
  if (!result.success) {
    return {
      success: false as const,
      error: result.error.errors[0]?.message || 'Validation failed',
    };
  }
  return { success: true as const, data: result.data };
}

/**
 * Add whole UTC calendar days to a timestamp. Scheduling is always UTC so
 * local time-zone offsets cannot double-advance or skip a due day.
 */
export function addUtcDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function initialQuizDueAt(now: Date): Date {
  return addUtcDays(now, QUIZ_INITIAL_DUE_DAYS);
}

/**
 * Remembered interval after rating a card at `scheduleVersionBefore`.
 * version 0 -> +3d, 1 -> +7d, 2 -> +14d, 3+ -> +30d.
 */
export function rememberedIntervalDays(scheduleVersionBefore: number): number {
  const nextVersion = Math.min(
    scheduleVersionBefore + 1,
    QUIZ_MAX_SCHEDULE_VERSION
  );
  const index = Math.max(0, nextVersion - 1);
  return QUIZ_REMEMBERED_INTERVAL_DAYS[
    Math.min(index, QUIZ_REMEMBERED_INTERVAL_DAYS.length - 1)
  ];
}

export function nextScheduleAfterRating(args: {
  rating: QuizRating;
  scheduleVersionBefore: number;
  reviewedAt: Date;
  dueAtBefore: Date;
}): {
  scheduleVersionAfter: number;
  dueAtAfter: Date;
  reviewStateAfter: QuizReviewState;
} {
  if (args.rating === 'again') {
    return {
      scheduleVersionAfter: 0,
      dueAtAfter: addUtcDays(args.reviewedAt, QUIZ_AGAIN_RESET_DAYS),
      reviewStateAfter: 'relearning',
    };
  }

  const scheduleVersionAfter = Math.min(
    args.scheduleVersionBefore + 1,
    QUIZ_MAX_SCHEDULE_VERSION
  );
  return {
    scheduleVersionAfter,
    dueAtAfter: addUtcDays(
      args.reviewedAt,
      rememberedIntervalDays(args.scheduleVersionBefore)
    ),
    reviewStateAfter: 'review',
  };
}

export function toQuizCardQuestionPublic(
  row: QuizCardRecord
): QuizCardQuestionPublic {
  return {
    id: row.id,
    pathId: row.path_id,
    pathStageId: row.path_stage_id,
    revisionId: row.revision_id,
    completionVersion: row.completion_version,
    cardIndex: row.card_index,
    question: row.question,
    evidenceBasis: row.evidence_basis,
    evidenceLabel: row.evidence_label,
    isMetadataOnly: row.is_metadata_only,
    scheduleVersion: row.schedule_version,
    dueAt: row.due_at,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toQuizCardRevealPublic(
  row: QuizCardRecord
): QuizCardRevealPublic {
  return {
    ...toQuizCardQuestionPublic(row),
    answerRubric: row.answer_rubric,
  };
}

export function toQuizReviewAttemptPublic(
  row: QuizReviewAttemptRecord
): QuizReviewAttemptPublic {
  return {
    id: row.id,
    quizCardId: row.quiz_card_id,
    pathId: row.path_id,
    pathStageId: row.path_stage_id,
    revisionId: row.revision_id,
    rating: row.rating,
    scheduleVersionBefore: row.schedule_version_before,
    scheduleVersionAfter: row.schedule_version_after,
    dueAtBefore: row.due_at_before,
    dueAtAfter: row.due_at_after,
    reviewStateAfter: row.review_state_after,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

/**
 * Assert a public question payload never leaks the hidden rubric.
 */
export function assertQuestionPayloadHidesRubric(
  payload: Record<string, unknown>
): boolean {
  const forbidden = ['answer_rubric', 'answerRubric', 'rubric', 'answer'];
  return !forbidden.some((key) => key in payload && payload[key] != null);
}

export function buildQuizEvidence(args: {
  stages: PathStageWithVideos[];
  stageId: string;
  goal: string;
  reflection: string | null;
}): QuizEvidence | null {
  const stage = args.stages.find((item) => item.id === args.stageId);
  if (!stage) {
    return null;
  }

  return {
    stageTitle: stage.title,
    learningObjective: stage.learning_objective,
    videoTitles: stage.videos.map((video) => video.title),
    reflection:
      args.reflection && args.reflection.trim().length > 0
        ? args.reflection.trim().slice(0, 2000)
        : null,
    goal: args.goal,
  };
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(0, max);
}

/**
 * Deterministic small question set from objectives + legitimate metadata /
 * reflection only. All cards are metadata-only general topic practice —
 * never claim unseen video teaching.
 */
export function buildTemplateQuizCards(
  evidence: QuizEvidence
): GeneratedQuizCard[] {
  const titles =
    evidence.videoTitles.length > 0
      ? evidence.videoTitles.join('; ')
      : 'the listed stage videos';

  const evidenceBasis = evidence.reflection
    ? 'objectives_metadata_reflection'
    : 'objectives_metadata';

  const cards: GeneratedQuizCard[] = [
    {
      card_index: 0,
      question: clip(
        `[${QUIZ_METADATA_ONLY_LABEL}] In your own words, what is the learning objective for "${evidence.stageTitle}" on the path toward "${evidence.goal}"?`,
        QUIZ_QUESTION_MAX_LENGTH
      ),
      answer_rubric: clip(
        `Accept answers that restate or closely paraphrase the stage objective: ${evidence.learningObjective}. Do not require details that only appear inside video playback.`,
        QUIZ_RUBRIC_MAX_LENGTH
      ),
      evidence_basis: evidenceBasis,
      evidence_label: QUIZ_METADATA_ONLY_LABEL,
      is_metadata_only: true,
    },
    {
      card_index: 1,
      question: clip(
        `[${QUIZ_METADATA_ONLY_LABEL}] Which listed video titles from "${evidence.stageTitle}" support practicing: ${evidence.learningObjective}?`,
        QUIZ_QUESTION_MAX_LENGTH
      ),
      answer_rubric: clip(
        `Accept answers that name one or more of these metadata titles: ${titles}. Titles are the only video evidence available.`,
        QUIZ_RUBRIC_MAX_LENGTH
      ),
      evidence_basis: evidenceBasis,
      evidence_label: QUIZ_METADATA_ONLY_LABEL,
      is_metadata_only: true,
    },
  ];

  if (evidence.reflection) {
    cards.push({
      card_index: 2,
      question: clip(
        `[${QUIZ_METADATA_ONLY_LABEL}] What did you report practicing for "${evidence.stageTitle}"?`,
        QUIZ_QUESTION_MAX_LENGTH
      ),
      answer_rubric: clip(
        `Accept answers that reflect the learner note: "${evidence.reflection}". This is reflection metadata only, not proof of mastery.`,
        QUIZ_RUBRIC_MAX_LENGTH
      ),
      evidence_basis: evidenceBasis,
      evidence_label: QUIZ_METADATA_ONLY_LABEL,
      is_metadata_only: true,
    });
  }

  return cards.slice(0, QUIZ_MAX_CARDS_PER_STAGE);
}

/**
 * Active due list: due_at <= now, revision is the path's active revision, and
 * the revision status is active. Archived-revision cards are retained in
 * storage for restoration/history but excluded here.
 */
export function selectActiveDueQuizCards(args: {
  cards: QuizCardRecord[];
  activeRevisionId: string | null;
  now: Date;
}): QuizCardRecord[] {
  if (!args.activeRevisionId) {
    return [];
  }
  const nowMs = args.now.getTime();
  return args.cards
    .filter((card) => {
      if (card.revision_id !== args.activeRevisionId) {
        return false;
      }
      return new Date(card.due_at).getTime() <= nowMs;
    })
    .sort((a, b) => {
      const due = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (due !== 0) return due;
      return a.card_index - b.card_index;
    });
}

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export type InsertQuizCardsRpcResult =
  | {
      ok: true;
      created: boolean;
      revision_id: string;
      completion_version: number;
      cards: QuizCardRecord[];
    }
  | { ok: false; code: string };

export function mapInsertQuizCardsRpcPayload(
  data: unknown
): InsertQuizCardsRpcResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, code: 'insert_failed' };
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, code: String(row.code || 'insert_failed') };
  }
  const cards = Array.isArray(row.cards) ? (row.cards as QuizCardRecord[]) : [];
  return {
    ok: true,
    created: Boolean(row.created),
    revision_id: String(row.revision_id),
    completion_version: Number(row.completion_version),
    cards: cards.map(normalizeQuizCardRecord),
  };
}

export type SubmitQuizReviewRpcResult =
  | {
      ok: true;
      created: boolean;
      card: QuizCardRecord;
      attempt: QuizReviewAttemptRecord;
    }
  | { ok: false; code: string };

export function mapSubmitQuizReviewRpcPayload(
  data: unknown
): SubmitQuizReviewRpcResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, code: 'review_failed' };
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, code: String(row.code || 'review_failed') };
  }
  if (!row.card || !row.attempt) {
    return { ok: false, code: 'review_failed' };
  }
  return {
    ok: true,
    created: Boolean(row.created),
    card: normalizeQuizCardRecord(row.card as QuizCardRecord),
    attempt: normalizeAttemptRecord(row.attempt as QuizReviewAttemptRecord),
  };
}

function normalizeQuizCardRecord(row: QuizCardRecord): QuizCardRecord {
  return {
    ...row,
    is_metadata_only: Boolean(row.is_metadata_only),
    schedule_version: Number(row.schedule_version),
    completion_version: Number(row.completion_version),
    card_index: Number(row.card_index),
    review_state: normalizeReviewState(row.review_state),
  };
}

function normalizeAttemptRecord(
  row: QuizReviewAttemptRecord
): QuizReviewAttemptRecord {
  return {
    ...row,
    rating: row.rating === 'again' ? 'again' : 'remembered',
    schedule_version_before: Number(row.schedule_version_before),
    schedule_version_after: Number(row.schedule_version_after),
    review_state_after: normalizeReviewState(row.review_state_after),
  };
}

function normalizeReviewState(value: string): QuizReviewState {
  if (value === 'relearning' || value === 'review') {
    return value;
  }
  return 'new';
}

export async function loadOwnedQuizCardsForPath(
  db: DbClient,
  ownerId: string,
  pathId: string
): Promise<
  | { ok: true; cards: QuizCardRecord[] }
  | { ok: false; status: 500; error: string }
> {
  const { data, error } = await db
    .from('quiz_cards')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_id', pathId)
    .order('due_at', { ascending: true });

  if (error) {
    console.error('loadOwnedQuizCardsForPath error:', error);
    return { ok: false, status: 500, error: 'Failed to load quiz cards' };
  }

  return {
    ok: true,
    cards: ((data || []) as QuizCardRecord[]).map(normalizeQuizCardRecord),
  };
}

export async function loadOwnedQuizCard(
  db: DbClient,
  ownerId: string,
  pathId: string,
  cardId: string
): Promise<
  | { ok: true; card: QuizCardRecord }
  | { ok: false; status: 404 | 500; error: string }
> {
  const parsed = uuidSchema.safeParse(cardId);
  if (!parsed.success) {
    return { ok: false, status: 404, error: 'Quiz card not found' };
  }

  const { data, error } = await db
    .from('quiz_cards')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_id', pathId)
    .eq('id', cardId)
    .maybeSingle();

  if (error) {
    console.error('loadOwnedQuizCard error:', error);
    return { ok: false, status: 500, error: 'Failed to load quiz card' };
  }

  if (!data) {
    return { ok: false, status: 404, error: 'Quiz card not found' };
  }

  return { ok: true, card: normalizeQuizCardRecord(data as QuizCardRecord) };
}

export async function loadOwnedQuizAttemptsForCard(
  db: DbClient,
  ownerId: string,
  cardId: string
): Promise<
  | { ok: true; attempts: QuizReviewAttemptRecord[] }
  | { ok: false; status: 500; error: string }
> {
  const { data, error } = await db
    .from('quiz_review_attempts')
    .select('*')
    .eq('owner', ownerId)
    .eq('quiz_card_id', cardId)
    .order('reviewed_at', { ascending: true });

  if (error) {
    console.error('loadOwnedQuizAttemptsForCard error:', error);
    return { ok: false, status: 500, error: 'Failed to load review attempts' };
  }

  return {
    ok: true,
    attempts: ((data || []) as QuizReviewAttemptRecord[]).map(
      normalizeAttemptRecord
    ),
  };
}

/**
 * Generate-or-return the card set for a completed stage version. Never
 * regenerates when cards already exist for that version.
 */
export async function ensureStageQuizCards(args: {
  db: DbClient;
  ownerId: string;
  pathId: string;
  stageId: string;
  completionVersion: number;
  stages: PathStageWithVideos[];
  goal: string;
  reflection: string | null;
  now?: Date;
}): Promise<
  | {
      ok: true;
      created: boolean;
      cards: QuizCardRecord[];
      questions: QuizCardQuestionPublic[];
    }
  | { ok: false; status: 400 | 404 | 500; error: string }
> {
  const evidence = buildQuizEvidence({
    stages: args.stages,
    stageId: args.stageId,
    goal: args.goal,
    reflection: args.reflection,
  });
  if (!evidence) {
    return {
      ok: false,
      status: 404,
      error: 'Path stage not found in active revision',
    };
  }

  const generated = buildTemplateQuizCards(evidence);
  const dueAt = initialQuizDueAt(args.now ?? new Date()).toISOString();

  const { data, error } = await args.db.rpc('insert_stage_quiz_cards', {
    p_path_id: args.pathId,
    p_owner: args.ownerId,
    p_stage_id: args.stageId,
    p_completion_version: args.completionVersion,
    p_cards: generated,
    p_due_at: dueAt,
  });

  if (error) {
    console.error('insert_stage_quiz_cards error:', error);
    return { ok: false, status: 500, error: 'Failed to create quiz cards' };
  }

  const mapped = mapInsertQuizCardsRpcPayload(data);
  if (!mapped.ok) {
    if (
      mapped.code === 'not_found' ||
      mapped.code === 'foreign_id' ||
      mapped.code === 'no_active_revision' ||
      mapped.code === 'stale_completion_version'
    ) {
      return {
        ok: false,
        status: 404,
        error: 'Path stage not found in active revision',
      };
    }
    if (mapped.code === 'invalid_payload') {
      return { ok: false, status: 400, error: 'Invalid quiz card payload' };
    }
    return { ok: false, status: 500, error: 'Failed to create quiz cards' };
  }

  return {
    ok: true,
    created: mapped.created,
    cards: mapped.cards,
    questions: mapped.cards.map(toQuizCardQuestionPublic),
  };
}

export async function listDueReviewsForPath(args: {
  db: DbClient;
  ownerId: string;
  pathId: string;
  now?: Date;
}): Promise<
  | {
      ok: true;
      pathTitle: string;
      activeRevisionId: string | null;
      due: QuizCardQuestionPublic[];
      cards: QuizCardRecord[];
    }
  | { ok: false; status: 404 | 500; error: string }
> {
  const owned = await getOwnedPath(args.db, args.ownerId, args.pathId);
  if (!owned.ok) {
    return {
      ok: false,
      status: owned.status === 404 ? 404 : 500,
      error: owned.error,
    };
  }

  const loaded = await loadOwnedQuizCardsForPath(
    args.db,
    args.ownerId,
    args.pathId
  );
  if (!loaded.ok) {
    return loaded;
  }

  const dueRows = selectActiveDueQuizCards({
    cards: loaded.cards,
    activeRevisionId: owned.path.active_revision_id ?? null,
    now: args.now ?? new Date(),
  });

  return {
    ok: true,
    pathTitle: owned.path.title,
    activeRevisionId: owned.path.active_revision_id ?? null,
    due: dueRows.map(toQuizCardQuestionPublic),
    cards: loaded.cards,
  };
}

export async function listDueReviewsForOwner(args: {
  db: DbClient;
  ownerId: string;
  now?: Date;
}): Promise<
  | { ok: true; summaries: DueReviewSummary[] }
  | { ok: false; status: 500; error: string }
> {
  const { data: paths, error: pathsError } = await args.db
    .from('paths')
    .select('id, title, active_revision_id')
    .eq('owner', args.ownerId)
    .order('updated_at', { ascending: false });

  if (pathsError) {
    console.error('listDueReviewsForOwner paths error:', pathsError);
    return { ok: false, status: 500, error: 'Failed to load due reviews' };
  }

  const pathRows = (paths || []) as Array<{
    id: string;
    title: string;
    active_revision_id: string | null;
  }>;

  if (pathRows.length === 0) {
    return { ok: true, summaries: [] };
  }

  const { data: cards, error: cardsError } = await args.db
    .from('quiz_cards')
    .select('*')
    .eq('owner', args.ownerId)
    .in(
      'path_id',
      pathRows.map((row) => row.id)
    )
    .order('due_at', { ascending: true });

  if (cardsError) {
    console.error('listDueReviewsForOwner cards error:', cardsError);
    return { ok: false, status: 500, error: 'Failed to load due reviews' };
  }

  const now = args.now ?? new Date();
  const cardsByPath = new Map<string, QuizCardRecord[]>();
  for (const row of (cards || []) as QuizCardRecord[]) {
    const normalized = normalizeQuizCardRecord(row);
    const list = cardsByPath.get(normalized.path_id) || [];
    list.push(normalized);
    cardsByPath.set(normalized.path_id, list);
  }

  const summaries: DueReviewSummary[] = [];
  for (const path of pathRows) {
    const due = selectActiveDueQuizCards({
      cards: cardsByPath.get(path.id) || [],
      activeRevisionId: path.active_revision_id,
      now,
    }).map(toQuizCardQuestionPublic);
    if (due.length === 0) {
      continue;
    }
    summaries.push({
      pathId: path.id,
      pathTitle: path.title,
      dueCount: due.length,
      cards: due,
    });
  }

  return { ok: true, summaries };
}

export async function submitOwnedQuizReview(args: {
  db: DbClient;
  ownerId: string;
  pathId: string;
  cardId: string;
  rating: QuizRating;
  expectedScheduleVersion: number;
  now?: Date;
}): Promise<
  | {
      ok: true;
      created: boolean;
      question: QuizCardQuestionPublic;
      attempt: QuizReviewAttemptPublic;
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }
> {
  const owned = await getOwnedPath(args.db, args.ownerId, args.pathId);
  if (!owned.ok) {
    return {
      ok: false,
      status: owned.status === 404 ? 404 : 500,
      error: owned.error,
    };
  }

  const { data, error } = await args.db.rpc('submit_quiz_review', {
    p_path_id: args.pathId,
    p_owner: args.ownerId,
    p_card_id: args.cardId,
    p_rating: args.rating,
    p_expected_schedule_version: args.expectedScheduleVersion,
    p_reviewed_at: (args.now ?? new Date()).toISOString(),
  });

  if (error) {
    console.error('submit_quiz_review error:', error);
    return { ok: false, status: 500, error: 'Failed to submit review' };
  }

  const mapped = mapSubmitQuizReviewRpcPayload(data);
  if (!mapped.ok) {
    if (mapped.code === 'not_found') {
      return { ok: false, status: 404, error: 'Quiz card not found' };
    }
    if (mapped.code === 'archived_revision') {
      return {
        ok: false,
        status: 409,
        error: 'Quiz card belongs to an archived revision',
      };
    }
    if (mapped.code === 'stale_schedule') {
      return {
        ok: false,
        status: 409,
        error: 'Quiz card schedule version is out of date',
      };
    }
    if (mapped.code === 'invalid_payload') {
      return { ok: false, status: 400, error: 'Invalid review payload' };
    }
    return { ok: false, status: 500, error: 'Failed to submit review' };
  }

  return {
    ok: true,
    created: mapped.created,
    question: toQuizCardQuestionPublic(mapped.card),
    attempt: toQuizReviewAttemptPublic(mapped.attempt),
  };
}
