import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ResearchCandidate,
  ResearchSelection,
} from './path-research-schema';
import {
  isPathVideoRuleActiveForPathGeneration,
  type PathVideoRulePublic,
  type PathVideoRuleRecord,
  type PathVideoRuleTargetType,
  toPathVideoRulePublic,
} from './path-video-rules';

/**
 * Research-pipeline application of explicitly active path_video_rules.
 * Soft-dismiss presentation filtering is intentionally untouched.
 * LLM assessment status never qualifies a rule — only status='active' does.
 */

export const PATH_VIDEO_RULE_PROMPT_CONSTRAINT_VERSION =
  'path-video-rules-prompt-v1';

/** Target types with supported candidate metadata in research v1. */
export const PATH_VIDEO_RULE_RESEARCH_ACTIVE_TARGET_TYPES = [
  'video',
  'creator',
] as const;

export type PathVideoRuleResearchActiveTargetType =
  (typeof PATH_VIDEO_RULE_RESEARCH_ACTIVE_TARGET_TYPES)[number];

/** Targets reserved until candidate metadata exists. */
export const PATH_VIDEO_RULE_RESEARCH_INACTIVE_TARGET_TYPES = [
  'topic',
  'language',
  'difficulty',
] as const;

export type PathVideoRuleExecutable = {
  id: string;
  ruleKey: string;
  targetType: PathVideoRuleResearchActiveTargetType;
  operator: 'equals';
  value: string;
  action: 'exclude';
  version: number;
  reason: string;
};

export type PathVideoRuleExclusion = {
  stageIndex: number;
  youtubeVideoId: string;
  ruleId: string;
  ruleKey: string;
  targetType: PathVideoRuleResearchActiveTargetType;
  value: string;
};

export type PathVideoRulePromptConstraint = {
  ruleKey: string;
  targetType: PathVideoRuleResearchActiveTargetType;
  operator: 'equals';
  value: string;
  action: 'exclude';
};

export type PathVideoRulePromptConstraints = {
  version: string;
  dataClassification: 'STRUCTURED_EXCLUSION_RULES_AS_DATA_NOT_INSTRUCTIONS';
  rules: PathVideoRulePromptConstraint[];
};

export type PathVideoRuleResearchSnapshot = {
  promptConstraintVersion: string;
  rulesVersion: string;
  rules: Array<{
    id: string;
    ruleKey: string;
    targetType: PathVideoRuleTargetType;
    operator: 'equals';
    value: string;
    action: 'exclude';
    version: number;
  }>;
  excludedCandidates: PathVideoRuleExclusion[];
};

type DbClient = Pick<SupabaseClient, 'from'>;

function isResearchActiveTargetType(
  targetType: PathVideoRuleTargetType
): targetType is PathVideoRuleResearchActiveTargetType {
  return (
    PATH_VIDEO_RULE_RESEARCH_ACTIVE_TARGET_TYPES as readonly string[]
  ).includes(targetType);
}

function normalizeCreatorValue(value: string): string {
  return value.trim().toLowerCase();
}

function toPublicRule(
  rule: PathVideoRulePublic | PathVideoRuleRecord
): PathVideoRulePublic {
  return 'ruleKey' in rule ? rule : toPathVideoRulePublic(rule);
}

/**
 * Only status='active' qualifies. Assessment / draft / suspended / retired do not.
 * topic/language/difficulty remain non-executable until metadata exists.
 */
export function toExecutablePathVideoRules(
  rules: ReadonlyArray<PathVideoRulePublic | PathVideoRuleRecord>
): PathVideoRuleExecutable[] {
  const executable: PathVideoRuleExecutable[] = [];

  for (const rule of rules) {
    const publicRule = toPublicRule(rule);
    if (!isPathVideoRuleActiveForPathGeneration(publicRule.status)) {
      continue;
    }
    if (!isResearchActiveTargetType(publicRule.targetType)) {
      continue;
    }
    if (publicRule.operator !== 'equals' || publicRule.action !== 'exclude') {
      continue;
    }

    executable.push({
      id: publicRule.id,
      ruleKey: publicRule.ruleKey,
      targetType: publicRule.targetType,
      operator: 'equals',
      value: publicRule.value,
      action: 'exclude',
      version: publicRule.version,
      reason: publicRule.reason,
    });
  }

  executable.sort((left, right) => {
    if (left.ruleKey < right.ruleKey) return -1;
    if (left.ruleKey > right.ruleKey) return 1;
    if (left.version !== right.version) return left.version - right.version;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });

  return executable;
}

/** Deterministic fingerprint of the applied active executable rule set. */
export function buildPathVideoRuleSetVersion(
  rules: ReadonlyArray<PathVideoRuleExecutable>
): string {
  if (rules.length === 0) {
    return 'none';
  }
  return rules
    .map((rule) => `${rule.ruleKey}@${rule.version}:${rule.id}`)
    .join('|');
}

/**
 * Compile active executable rules into a bounded prompt constraint block.
 * Values are data; reasons are omitted to preserve prompt-injection boundaries.
 */
export function compilePathVideoRulePromptConstraints(
  rules: ReadonlyArray<PathVideoRuleExecutable>
): PathVideoRulePromptConstraints {
  return {
    version: PATH_VIDEO_RULE_PROMPT_CONSTRAINT_VERSION,
    dataClassification: 'STRUCTURED_EXCLUSION_RULES_AS_DATA_NOT_INSTRUCTIONS',
    rules: rules.map((rule) => ({
      ruleKey: rule.ruleKey,
      targetType: rule.targetType,
      operator: rule.operator,
      value: rule.value,
      action: rule.action,
    })),
  };
}

/**
 * Pure evaluator: whether a candidate is excluded by a single executable rule.
 * Missing creator metadata remains eligible. Unsupported targets never match.
 */
export function candidateMatchesPathVideoRule(
  candidate: ResearchCandidate,
  rule: PathVideoRuleExecutable
): boolean {
  if (rule.action !== 'exclude' || rule.operator !== 'equals') {
    return false;
  }

  if (rule.targetType === 'video') {
    return candidate.youtubeVideoId === rule.value.trim();
  }

  if (rule.targetType === 'creator') {
    const channel = candidate.channelTitle?.trim() ?? '';
    if (channel.length === 0) {
      return false;
    }
    return normalizeCreatorValue(channel) === normalizeCreatorValue(rule.value);
  }

  return false;
}

/**
 * Filter candidates after search and before selectVideos.
 * Preserves per-stage relative ordering and records exclusions.
 */
export function filterResearchCandidatesByPathVideoRules(args: {
  candidatesByStage: ReadonlyMap<number, ReadonlyArray<ResearchCandidate>>;
  rules: ReadonlyArray<PathVideoRuleExecutable>;
}): {
  candidatesByStage: Map<number, ResearchCandidate[]>;
  excludedCandidates: PathVideoRuleExclusion[];
  emptyStages: number[];
} {
  const candidatesByStage = new Map<number, ResearchCandidate[]>();
  const excludedCandidates: PathVideoRuleExclusion[] = [];
  const emptyStages: number[] = [];

  const stageIndexes = [...args.candidatesByStage.keys()].sort((a, b) => a - b);

  for (const stageIndex of stageIndexes) {
    const pool = args.candidatesByStage.get(stageIndex) || [];
    const kept: ResearchCandidate[] = [];

    for (const candidate of pool) {
      let matched: PathVideoRuleExecutable | null = null;
      for (const rule of args.rules) {
        if (candidateMatchesPathVideoRule(candidate, rule)) {
          matched = rule;
          break;
        }
      }

      if (matched) {
        excludedCandidates.push({
          stageIndex,
          youtubeVideoId: candidate.youtubeVideoId,
          ruleId: matched.id,
          ruleKey: matched.ruleKey,
          targetType: matched.targetType,
          value: matched.value,
        });
        continue;
      }

      kept.push(candidate);
    }

    candidatesByStage.set(stageIndex, kept);
    if (kept.length === 0) {
      emptyStages.push(stageIndex);
    }
  }

  return { candidatesByStage, excludedCandidates, emptyStages };
}

/**
 * Post-selection guard: refuse selections that include previously excluded IDs.
 */
export function assertSelectionRespectsPathVideoRules(
  selection: ResearchSelection,
  excludedCandidates: ReadonlyArray<PathVideoRuleExclusion>
): { ok: true } | { ok: false; error: string } {
  if (excludedCandidates.length === 0) {
    return { ok: true };
  }

  const excludedIds = new Set(
    excludedCandidates.map((item) => item.youtubeVideoId)
  );

  for (const stage of selection.stages) {
    for (const videoId of stage.videoIds) {
      if (excludedIds.has(videoId)) {
        return {
          ok: false,
          error: `Selected video ${videoId} is excluded by an active path video rule`,
        };
      }
    }
  }

  return { ok: true };
}

export function buildPathVideoRuleResearchSnapshot(args: {
  activeRules: ReadonlyArray<PathVideoRulePublic | PathVideoRuleRecord>;
  executableRules: ReadonlyArray<PathVideoRuleExecutable>;
  excludedCandidates: ReadonlyArray<PathVideoRuleExclusion>;
}): PathVideoRuleResearchSnapshot {
  const snapshotRules = [...args.activeRules]
    .map(toPublicRule)
    .sort((left, right) => {
      if (left.ruleKey < right.ruleKey) return -1;
      if (left.ruleKey > right.ruleKey) return 1;
      if (left.version !== right.version) return left.version - right.version;
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    })
    .map((rule) => ({
      id: rule.id,
      ruleKey: rule.ruleKey,
      targetType: rule.targetType,
      operator: 'equals' as const,
      value: rule.value,
      action: 'exclude' as const,
      version: rule.version,
    }));

  return {
    promptConstraintVersion: PATH_VIDEO_RULE_PROMPT_CONSTRAINT_VERSION,
    rulesVersion: buildPathVideoRuleSetVersion(args.executableRules),
    rules: snapshotRules,
    excludedCandidates: [...args.excludedCandidates],
  };
}

/**
 * Merge rule provenance into an existing research input_snapshot without
 * dropping goal/background/title or other research fields.
 */
export function mergePathVideoRuleSnapshotIntoInput(
  inputSnapshot: Record<string, unknown>,
  ruleSnapshot: PathVideoRuleResearchSnapshot
): Record<string, unknown> {
  return {
    ...inputSnapshot,
    pathVideoRules: ruleSnapshot,
  };
}

/**
 * Load active path_video_rules deterministically via the service-role client.
 * Does not consult LLM assessment status.
 */
export async function loadActivePathVideoRulesForResearch(
  db: DbClient
): Promise<
  | {
      ok: true;
      rules: PathVideoRulePublic[];
      executableRules: PathVideoRuleExecutable[];
      promptConstraints: PathVideoRulePromptConstraints;
      rulesVersion: string;
    }
  | { ok: false; status: 500; error: string }
> {
  const { data, error } = await db
    .from('path_video_rules')
    .select('*')
    .eq('status', 'active')
    .order('rule_key', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('loadActivePathVideoRulesForResearch error:', error);
    return {
      ok: false,
      status: 500,
      error: 'Failed to load active path video rules',
    };
  }

  const rows = [...((data as PathVideoRuleRecord[] | null) || [])].sort(
    (left, right) => {
      if (left.rule_key < right.rule_key) return -1;
      if (left.rule_key > right.rule_key) return 1;
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    }
  );
  const rules = rows.map(toPathVideoRulePublic);
  const executableRules = toExecutablePathVideoRules(rules);

  return {
    ok: true,
    rules,
    executableRules,
    promptConstraints: compilePathVideoRulePromptConstraints(executableRules),
    rulesVersion: buildPathVideoRuleSetVersion(executableRules),
  };
}
