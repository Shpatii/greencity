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
