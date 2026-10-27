import { cityStats, topReasons, topSegments } from '@/lib/stats';
import type { SegmentFeature } from '@/lib/loadData';
import type { SegmentProps } from '@/lib/types';

function seg(overrides: Partial<SegmentProps>): SegmentFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[9.21, 49.14], [9.22, 49.15]] },
    properties: {
      id: 'seg_000001', osm_id: null, name: null, length_m: 100,
      n_points: 10, n_overtakes: 0, share_below_150: null, avg_overtake_cm: null,
      danger_per_100m: null, mean_danger_risk: null, mean_pm_risk: null,
      roughness_norm: null, traffic_flow: null, avg_speed_kmh: null,
      f_safety: 0, f_danger: 0, f_surface: 0, f_air: 0, f_flow: 0,
      missing: [], confidence: 0, eligible: false, score: null, rank: null, reason_texts: {},
      ...overrides,
    },
  };
}

const weights = { safety: 0.35, danger: 0.25, surface: 0.15, air: 0.15, flow: 0.1 };

describe('cityStats', () => {
  it('sums overtakes and close passes across segments', () => {
    const s = cityStats([
      seg({ n_overtakes: 10, share_below_150: 0.8, eligible: true }),
      seg({ n_overtakes: 30, share_below_150: 0.5 }),
      seg({}),
    ]);
    expect(s).toEqual({ measured: 3, ranked: 1, overtakes: 40, closePasses: 23, closeShare: 23 / 40 });
  });

  it('has no close share without overtakes', () => {
    expect(cityStats([seg({})]).closeShare).toBeNull();
  });
});

describe('topSegments', () => {
  it('returns ranked segments in rank order', () => {
    const ids = topSegments(
      [seg({ id: 'b', eligible: true, rank: 2 }), seg({ id: 'x' }), seg({ id: 'a', eligible: true, rank: 1 })],
      2,
    ).map((f) => f.properties.id);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('topReasons', () => {
  it('orders reasons by weight × factor', () => {
    const p = seg({
      f_safety: 0.2, f_air: 1,
      reason_texts: { safety: 'safety', air: 'air' },
    }).properties;
    // air 0.15 × 1 = 0.15 beats safety 0.35 × 0.2 = 0.07
    expect(topReasons(p, weights, 2).map((r) => r.key)).toEqual(['air', 'safety']);
  });
});
