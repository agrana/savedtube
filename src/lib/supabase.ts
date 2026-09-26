import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { config } from './config';

/**
 * Server-side Supabase client for API routes.
 * Uses the service role key; authorization is enforced in the application layer
 * with NextAuth session checks and explicit user_id filtering.
 *
 * Do not import this module from Client Components or other browser bundles.
 */
export const createServerSupabaseClient = (accessToken?: string) => {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

// Database types for TypeScript
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          avatar_url: string | null;
          email: string | null;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      playlist_progress: {
        Row: {
          id: string;
          user_id: string;
          playlist_id: string;
          video_id: string;
          watched: boolean;
          watched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          playlist_id: string;
          video_id: string;
          watched: boolean;
          watched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          playlist_id?: string;
          video_id?: string;
          watched?: boolean;
          watched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      hidden_playlists: {
        Row: {
          id: string;
          user_id: string;
          playlist_id: string;
          hidden_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          playlist_id: string;
          hidden_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          playlist_id?: string;
          hidden_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      playlist_item_edits: {
        Row: {
          id: string;
          user_id: string;
          playlist_id: string;
          video_id: string;
          custom_order: number | null;
          removed: boolean;
          added_by_user: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          playlist_id: string;
          video_id: string;
          custom_order?: number | null;
          removed?: boolean;
          added_by_user?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          playlist_id?: string;
          video_id?: string;
          custom_order?: number | null;
          removed?: boolean;
          added_by_user?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      paths: {
        Row: {
          id: string;
          owner: string;
          goal: string;
          background: string | null;
          title: string;
          active_revision_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          goal: string;
          background?: string | null;
          title: string;
          active_revision_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          goal?: string;
          background?: string | null;
          title?: string;
          active_revision_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      path_revisions: {
        Row: {
          id: string;
          path_id: string;
          revision_number: number;
          status: 'draft' | 'active' | 'archived';
          edit_version: number;
          input_snapshot: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          path_id: string;
          revision_number: number;
          status: 'draft' | 'active' | 'archived';
          edit_version?: number;
          input_snapshot: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          path_id?: string;
          revision_number?: number;
          status?: 'draft' | 'active' | 'archived';
          edit_version?: number;
          input_snapshot?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
      };
      path_stages: {
        Row: {
          id: string;
          revision_id: string;
          position: number;
          title: string;
          learning_objective: string;
          reason: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          revision_id: string;
          position: number;
          title: string;
          learning_objective: string;
          reason: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          revision_id?: string;
          position?: number;
          title?: string;
          learning_objective?: string;
          reason?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      path_videos: {
        Row: {
          id: string;
          stage_id: string;
          position: number;
          youtube_video_id: string;
          title: string;
          channel_title: string | null;
          selection_reason: string;
          source: 'research' | 'manual';
          duration_seconds: number | null;
          thumbnail_url: string | null;
          verified_at: string;
          metadata_snapshot: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stage_id: string;
          position: number;
          youtube_video_id: string;
          title: string;
          channel_title?: string | null;
          selection_reason: string;
          source: 'research' | 'manual';
          duration_seconds?: number | null;
          thumbnail_url?: string | null;
          verified_at: string;
          metadata_snapshot?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          stage_id?: string;
          position?: number;
          youtube_video_id?: string;
          title?: string;
          channel_title?: string | null;
          selection_reason?: string;
          source?: 'research' | 'manual';
          duration_seconds?: number | null;
          thumbnail_url?: string | null;
          verified_at?: string;
          metadata_snapshot?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      path_video_progress: {
        Row: {
          id: string;
          owner: string;
          path_video_id: string;
          practiced: boolean;
          practiced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          path_video_id: string;
          practiced?: boolean;
          practiced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          path_video_id?: string;
          practiced?: boolean;
          practiced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      path_stage_progress: {
        Row: {
          id: string;
          owner: string;
          path_stage_id: string;
          completed_at: string;
          reflection: string | null;
          completion_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          path_stage_id: string;
          completed_at: string;
          reflection?: string | null;
          completion_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          path_stage_id?: string;
          completed_at?: string;
          reflection?: string | null;
          completion_version?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      path_jobs: {
        Row: {
          id: string;
          owner: string;
          path_id: string;
          revision_id: string | null;
          kind: 'research' | 'interval_suggestions';
          idempotency_key: string;
          status:
            | 'queued'
            | 'running'
            | 'succeeded'
            | 'partial'
            | 'failed'
            | 'interrupted';
          phase:
            | 'accepted'
            | 'planning'
            | 'searching'
            | 'selecting'
            | 'saving'
            | 'parsing'
            | 'ranking'
            | 'done';
          attempt: number;
          deadline_at: string;
          input_snapshot: Record<string, unknown>;
          prompt_version: string | null;
          schema_version: string | null;
          model_provider: string | null;
          model_name: string | null;
          result: Record<string, unknown> | null;
          error: Record<string, unknown> | null;
          usage: Record<string, unknown> | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          path_id: string;
          revision_id?: string | null;
          kind: 'research' | 'interval_suggestions';
          idempotency_key: string;
          status:
            | 'queued'
            | 'running'
            | 'succeeded'
            | 'partial'
            | 'failed'
            | 'interrupted';
          phase:
            | 'accepted'
            | 'planning'
            | 'searching'
            | 'selecting'
            | 'saving'
            | 'parsing'
            | 'ranking'
            | 'done';
          attempt?: number;
          deadline_at: string;
          input_snapshot: Record<string, unknown>;
          prompt_version?: string | null;
          schema_version?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          result?: Record<string, unknown> | null;
          error?: Record<string, unknown> | null;
          usage?: Record<string, unknown> | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          path_id?: string;
          revision_id?: string | null;
          kind?: 'research' | 'interval_suggestions';
          idempotency_key?: string;
          status?:
            | 'queued'
            | 'running'
            | 'succeeded'
            | 'partial'
            | 'failed'
            | 'interrupted';
          phase?:
            | 'accepted'
            | 'planning'
            | 'searching'
            | 'selecting'
            | 'saving'
            | 'parsing'
            | 'ranking'
            | 'done';
          attempt?: number;
          deadline_at?: string;
          input_snapshot?: Record<string, unknown>;
          prompt_version?: string | null;
          schema_version?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          result?: Record<string, unknown> | null;
          error?: Record<string, unknown> | null;
          usage?: Record<string, unknown> | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      interval_suggestions: {
        Row: {
          id: string;
          owner: string;
          path_video_id: string;
          path_job_id: string;
          label: string;
          start_time: number;
          end_time: number;
          rationale: string;
          accepted_interval_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          path_video_id: string;
          path_job_id: string;
          label: string;
          start_time: number;
          end_time: number;
          rationale: string;
          accepted_interval_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          path_video_id?: string;
          path_job_id?: string;
          label?: string;
          start_time?: number;
          end_time?: number;
          rationale?: string;
          accepted_interval_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      stage_followups: {
        Row: {
          id: string;
          owner: string;
          path_id: string;
          path_stage_id: string;
          revision_id: string;
          completion_version: number;
          reflection: string | null;
          practiced_summary: string;
          encouragement: string;
          next_step: string;
          source: 'model' | 'template';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          path_id: string;
          path_stage_id: string;
          revision_id: string;
          completion_version: number;
          reflection?: string | null;
          practiced_summary: string;
          encouragement: string;
          next_step: string;
          source: 'model' | 'template';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          path_id?: string;
          path_stage_id?: string;
          revision_id?: string;
          completion_version?: number;
          reflection?: string | null;
          practiced_summary?: string;
          encouragement?: string;
          next_step?: string;
          source?: 'model' | 'template';
          created_at?: string;
          updated_at?: string;
        };
      };
      quiz_cards: {
        Row: {
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
          review_state: 'new' | 'relearning' | 'review';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
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
          is_metadata_only?: boolean;
          schedule_version?: number;
          due_at: string;
          review_state?: 'new' | 'relearning' | 'review';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          path_id?: string;
          path_stage_id?: string;
          revision_id?: string;
          completion_version?: number;
          card_index?: number;
          question?: string;
          answer_rubric?: string;
          evidence_basis?: string;
          evidence_label?: string;
          is_metadata_only?: boolean;
          schedule_version?: number;
          due_at?: string;
          review_state?: 'new' | 'relearning' | 'review';
          created_at?: string;
          updated_at?: string;
        };
      };
      quiz_review_attempts: {
        Row: {
          id: string;
          owner: string;
          quiz_card_id: string;
          path_id: string;
          path_stage_id: string;
          revision_id: string;
          rating: 'again' | 'remembered';
          schedule_version_before: number;
          schedule_version_after: number;
          due_at_before: string;
          due_at_after: string;
          review_state_after: 'new' | 'relearning' | 'review';
          reviewed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner: string;
          quiz_card_id: string;
          path_id: string;
          path_stage_id: string;
          revision_id: string;
          rating: 'again' | 'remembered';
          schedule_version_before: number;
          schedule_version_after: number;
          due_at_before: string;
          due_at_after: string;
          review_state_after: 'new' | 'relearning' | 'review';
          reviewed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner?: string;
          quiz_card_id?: string;
          path_id?: string;
          path_stage_id?: string;
          revision_id?: string;
          rating?: 'again' | 'remembered';
          schedule_version_before?: number;
          schedule_version_after?: number;
          due_at_before?: string;
          due_at_after?: string;
          review_state_after?: 'new' | 'relearning' | 'review';
          reviewed_at?: string;
          created_at?: string;
        };
      };
      generation_usage: {
        Row: {
          id: string;
          scope_type: 'user' | 'project';
          scope_key: string;
          period_start: string;
          reserved_units: number;
          consumed_units: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope_type: 'user' | 'project';
          scope_key: string;
          period_start: string;
          reserved_units?: number;
          consumed_units?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope_type?: 'user' | 'project';
          scope_key?: string;
          period_start?: string;
          reserved_units?: number;
          consumed_units?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
