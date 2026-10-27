// Same formula as pipeline/safelane/score.py, for live sliders.
// Operations run in the same order as score.py so the floats are bit-identical
// (CONTRACT.md 3.2, parity fixture contract/fixtures/score_cases.json).
import type { FactorKey, Meta, SegmentProps, Weights } from './types';

export const FACTORS: FactorKey[] = ['safety', 'danger', 'surface', 'air', 'flow'];

// Absorbs float noise like 49.849999... before rounding half up.
const ROUND_EPS = 1e-6;

export interface SegmentScore {
  eligible: boolean;
  confidence: number;
  score: number | null;
}

export interface RankedSegment {
  id: string;
  score: number | null;
  rank: number | null;
}

type ScoreInput = Pick<SegmentProps, 'n_points' | 'f_safety' | 'f_danger' | 'f_surface' | 'f_air' | 'f_flow'>;
type ScoreMeta = Pick<Meta, 'min_points' | 'confidence_n'>;

/** Round half up to 1 decimal, like score.round_score. */
export function roundScore(raw: number): number {
  return Math.floor(raw * 10 + 0.5 + ROUND_EPS) / 10;
}

/** Round half to even at 3 decimals, like numpy.round(c, 3). */
function roundConfidence(c: number): number {
  const scaled = c * 1000;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded = diff > 0.5 || (diff === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
  return rounded / 1000;
}

export function scoreSegment(p: ScoreInput, w: Weights, meta: ScoreMeta): SegmentScore {
  let weighted = 0;
  for (const key of FACTORS) {
    weighted = weighted + w[key] * p[`f_${key}`];
  }
  const c = Math.min(1, p.n_points / meta.confidence_n);
  const eligible = p.n_points >= meta.min_points;
  // Score uses the unrounded confidence; only the stored value is rounded.
  return {
    eligible,
    confidence: roundConfidence(c),
    score: eligible ? roundScore(100 * c * weighted) : null,
  };
}

/**
 * Rank eligible segments by score desc, then n_points desc, then id asc.
 * Returns ranked segments first, then ineligible ones (rank null) in input order.
 */
export function rankSegments(
  features: { properties: SegmentProps }[],
  w: Weights,
  meta: ScoreMeta,
): RankedSegment[] {
  const scored = features.map(({ properties: p }) => ({
    id: p.id,
    n_points: p.n_points,
    ...scoreSegment(p, w, meta),
  }));
  const eligible = scored
    .filter((s) => s.eligible)
    .sort((a, b) =>
      (b.score as number) - (a.score as number)
      || b.n_points - a.n_points
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [
    ...eligible.map((s, i) => ({ id: s.id, score: s.score, rank: i + 1 })),
    ...scored.filter((s) => !s.eligible).map((s) => ({ id: s.id, score: null, rank: null })),
  ];
}

/** Weight x factor per key, for ordering a segment's reasons. */
export function contributions(p: ScoreInput, w: Weights): Record<FactorKey, number> {
  return Object.fromEntries(FACTORS.map((key) => [key, w[key] * p[`f_${key}`]])) as Record<FactorKey, number>;
}
