// City-wide numbers and per-segment reasons derived from segments.geojson.
import type { SegmentFeature } from './loadData';
import type { FactorKey, SegmentProps, Weights } from './types';

export interface CityStats {
  measured: number;
  ranked: number;
  overtakes: number;
  closePasses: number;
  /** Share of all recorded overtakes closer than 150 cm; null without overtakes. */
  closeShare: number | null;
}

export function cityStats(segments: SegmentFeature[]): CityStats {
  let ranked = 0;
  let overtakes = 0;
  let closePasses = 0;
  for (const { properties: p } of segments) {
    if (p.eligible) ranked += 1;
    overtakes += p.n_overtakes;
    if (p.share_below_150 !== null) closePasses += Math.round(p.share_below_150 * p.n_overtakes);
  }
  return {
    measured: segments.length,
    ranked,
    overtakes,
    closePasses,
    closeShare: overtakes > 0 ? closePasses / overtakes : null,
  };
}

/** Ranked segments, best rank first. */
export function topSegments(segments: SegmentFeature[], n: number): SegmentFeature[] {
  return segments
    .filter((f) => f.properties.eligible && f.properties.rank !== null)
    .sort((a, b) => (a.properties.rank ?? Infinity) - (b.properties.rank ?? Infinity))
    .slice(0, n);
}

/** Reason texts sorted by contribution (weight × factor value), largest first. */
export function topReasons(p: SegmentProps, weights: Weights, n: number): { key: FactorKey; text: string }[] {
  const value: Record<FactorKey, number> = {
    safety: p.f_safety,
    danger: p.f_danger,
    surface: p.f_surface,
    air: p.f_air,
    flow: p.f_flow,
  };
  return (Object.keys(p.reason_texts) as FactorKey[])
    .map((key) => ({ key, text: p.reason_texts[key]!, contribution: weights[key] * value[key] }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, n)
    .map(({ key, text }) => ({ key, text }));
}
