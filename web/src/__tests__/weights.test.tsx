import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import WeightSliders from '@/components/WeightSliders';
import { FACTORS, rescore } from '@/lib/score';
import type { SegmentProps, Weights } from '@/lib/types';
import { rebalance, sameWeights } from '@/lib/weights';

const W: Weights = { safety: 0.35, danger: 0.25, surface: 0.15, air: 0.15, flow: 0.1 };
const sum = (w: Weights) => FACTORS.reduce((s, k) => s + w[k], 0);

describe('rebalance', () => {
  it('keeps the sum at 1 and the other weights in proportion', () => {
    const w = rebalance(W, 'safety', 0.65);
    expect(w.safety).toBe(0.65);
    expect(sum(w)).toBeCloseTo(1, 12);
    expect(w.danger / w.flow).toBeCloseTo(0.25 / 0.1, 12);
  });

  it('splits evenly when all other weights are 0', () => {
    const w = rebalance({ safety: 1, danger: 0, surface: 0, air: 0, flow: 0 }, 'safety', 0.6);
    expect(w.danger).toBeCloseTo(0.1, 12);
    expect(sum(w)).toBeCloseTo(1, 12);
  });

  it('clamps to 0..1', () => {
    expect(rebalance(W, 'air', 2).air).toBe(1);
    expect(rebalance(W, 'air', -1).air).toBe(0);
  });
});

describe('rescore', () => {
  const feature = (id: string, f_safety: number, f_flow: number) => ({
    properties: { id, n_points: 30, f_safety, f_danger: 0, f_surface: 0, f_air: 0, f_flow } as SegmentProps,
  });

  it('re-ranks with new weights and keeps other properties', () => {
    const features = [feature('seg_a', 1, 0), feature('seg_b', 0, 1)];
    const meta = { min_points: 5, confidence_n: 30 };
    const flowFirst = rescore(features, rebalance(W, 'flow', 0.9), meta);
    expect(flowFirst.find((f) => f.properties.id === 'seg_b')!.properties.rank).toBe(1);
    expect(flowFirst[0].properties.f_safety).toBe(1);
    expect(features[0].properties.rank).toBeUndefined(); // input not mutated
  });
});

describe('WeightSliders', () => {
  it('shows one slider per factor and rebalances on change', () => {
    const onChange = jest.fn();
    render(<WeightSliders weights={W} defaults={W} onChange={onChange} />);
    expect(screen.getAllByRole('slider')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Reset weights' })).toBeDisabled();

    fireEvent.change(screen.getByRole('slider', { name: 'Close passes weight' }), { target: { value: '55' } });
    const next = onChange.mock.calls[0][0] as Weights;
    expect(next.safety).toBeCloseTo(0.55, 12);
    expect(sum(next)).toBeCloseTo(1, 12);
  });

  it('resets to the defaults', () => {
    const onChange = jest.fn();
    render(<WeightSliders weights={rebalance(W, 'air', 0.5)} defaults={W} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset weights' }));
    expect(sameWeights(onChange.mock.calls[0][0], W)).toBe(true);
  });
});
