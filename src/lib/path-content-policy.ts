import type { ResearchCandidate } from './path-research-schema';

/**
 * Conservative product policy for obvious promotional videos.
 * This is a deterministic safety boundary before candidate selection; model
 * instructions remain supplementary and cannot re-admit a rejected candidate.
 */
export const PROMOTIONAL_VIDEO_POLICY_VERSION = 'obvious-promotional-v1';

const OBVIOUS_PROMOTIONAL_SIGNAL =
  /\b(?:sponsored\s+by|this\s+video\s+is\s+sponsored|affiliate\s+links?|use\s+code\s+[a-z0-9_-]+|promotional?\s+code|discount\s+code|limited\s+time\s+offer|buy\s+my\s+(?:course|book|program|product)|enroll\s+(?:in|today)|join\s+my\s+(?:course|community|program)|product\s+launch|official\s+commercial|promotional\s+video|advertisement)\b/i;

export type PromotionalCandidateCheck = {
  promotional: boolean;
  matchedText: string | null;
};

export function inspectPromotionalCandidate(
  candidate: Pick<
    ResearchCandidate,
    'title' | 'channelTitle' | 'descriptionExcerpt'
  >
): PromotionalCandidateCheck {
  const fields = [
    candidate.title,
    candidate.channelTitle,
    candidate.descriptionExcerpt || '',
  ];
  const matchedText =
    fields.find((field) => OBVIOUS_PROMOTIONAL_SIGNAL.test(field)) || null;
  return { promotional: matchedText !== null, matchedText };
}

export function isObviousPromotionalCandidate(
  candidate: ResearchCandidate
): boolean {
  return inspectPromotionalCandidate(candidate).promotional;
}

export function filterObviousPromotionalCandidates(
  candidatesByStage: ReadonlyMap<number, ReadonlyArray<ResearchCandidate>>
): {
  candidatesByStage: Map<number, ResearchCandidate[]>;
  excludedCandidates: ResearchCandidate[];
} {
  const filtered = new Map<number, ResearchCandidate[]>();
  const excludedCandidates: ResearchCandidate[] = [];

  for (const [stageIndex, candidates] of candidatesByStage) {
    const retained: ResearchCandidate[] = [];
    for (const candidate of candidates) {
      if (isObviousPromotionalCandidate(candidate)) {
        excludedCandidates.push(candidate);
      } else {
        retained.push(candidate);
      }
    }
    filtered.set(stageIndex, retained);
  }

  return { candidatesByStage: filtered, excludedCandidates };
}
