// Slider weights: keep them summing to 1, like score.py's check_weights.
import { FACTORS } from './score';
import type { FactorKey, Weights } from './types';

/** Set one weight and scale the others so all five still sum to 1. */
export function rebalance(weights: Weights, key: FactorKey, value: number): Weights {
  const v = Math.min(1, Math.max(0, value));
  const others = FACTORS.filter((k) => k !== key);
  const rest = others.reduce((sum, k) => sum + weights[k], 0);
  const next = { ...weights, [key]: v };
  for (const k of others) {
    next[k] = rest > 0 ? (weights[k] / rest) * (1 - v) : (1 - v) / others.length;
  }
  return next;
}

export function sameWeights(a: Weights, b: Weights): boolean {
  return FACTORS.every((k) => Math.abs(a[k] - b[k]) < 1e-9);
}

export type PresetKey = 'safetyFirst' | 'comfort' | 'cleanAir';

export const PRESETS: Record<PresetKey, Weights> = {
  safetyFirst: { safety: 0.5, danger: 0.3, surface: 0.1, air: 0.05, flow: 0.05 },
  comfort: { safety: 0.2, danger: 0.15, surface: 0.45, air: 0.1, flow: 0.1 },
  cleanAir: { safety: 0.2, danger: 0.15, surface: 0.1, air: 0.45, flow: 0.1 },
};
