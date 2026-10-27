import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contributions, rankSegments, scoreSegment } from './score';
import type { FactorKey, Meta, SegmentProps, Weights } from './types';

interface ScoreCase {
  name: string;
  props: Pick<SegmentProps, 'n_points' | 'f_safety' | 'f_danger' | 'f_surface' | 'f_air' | 'f_flow'>;
  weights: Weights;
  meta: Pick<Meta, 'min_points' | 'confidence_n'>;
  expected: { eligible: boolean; confidence: number; score: number | null };
}

const FIXTURE = path.resolve(__dirname, '../../../contract/fixtures/score_cases.json');
const cases: ScoreCase[] = JSON.parse(readFileSync(FIXTURE, 'utf-8'));

const W: Weights = { safety: 0.35, danger: 0.25, surface: 0.15, air: 0.15, flow: 0.1 };
const META = { min_points: 5, confidence_n: 30 };

function feature(id: string, n_points: number, f: number): { properties: SegmentProps } {
  return {
    properties: {
      id, n_points, f_safety: f, f_danger: f, f_surface: f, f_air: f, f_flow: f,
    } as SegmentProps,
  };
}

describe('score parity fixture', () => {
  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = scoreSegment(c.props, c.weights, c.meta);
    expect(result.eligible).toBe(c.expected.eligible);
    expect(Math.abs(result.confidence - c.expected.confidence)).toBeLessThanOrEqual(1e-6);
    expect(result.score).toBe(c.expected.score);
  });
});

describe('rankSegments', () => {
  it('orders by score desc, then n_points desc, then id asc; ineligible get null', () => {
    const features = [
      feature('seg_c', 40, 0.5), // 50.0
      feature('seg_b', 40, 0.5), // 50.0, same n_points -> id decides
      feature('seg_a', 60, 0.5), // 50.0, more points -> first
      feature('seg_d', 30, 0.9), // 90.0
      feature('seg_e', 4, 1), // ineligible
    ];
    expect(rankSegments(features, W, META)).toEqual([
      { id: 'seg_d', score: 90, rank: 1 },
      { id: 'seg_a', score: 50, rank: 2 },
      { id: 'seg_b', score: 50, rank: 3 },
      { id: 'seg_c', score: 50, rank: 4 },
      { id: 'seg_e', score: null, rank: null },
    ]);
  });

  it('does not mutate the input', () => {
    const features = [feature('seg_b', 30, 0.1), feature('seg_a', 30, 0.9)];
    rankSegments(features, W, META);
    expect(features.map((f) => f.properties.id)).toEqual(['seg_b', 'seg_a']);
  });
});

describe('contributions', () => {
  it('is weight x factor per key', () => {
    const p = { n_points: 41, f_safety: 0.58, f_danger: 0.72, f_surface: 0.22, f_air: 0.31, f_flow: 0.36 };
    const expected: Record<FactorKey, number> = {
      safety: 0.35 * 0.58, danger: 0.25 * 0.72, surface: 0.15 * 0.22, air: 0.15 * 0.31, flow: 0.1 * 0.36,
    };
    expect(contributions(p, W)).toEqual(expected);
  });
});
