/**
 * @jest-environment node
 */
// jsdom has no global fetch to spy on; Node 18+ does.
import { loadData } from '@/lib/loadData';

const mockMeta = {
  version: '1.1',
  source: 'atrai',
  generated_at: '2026-10-27T12:00:00+01:00',
  city: 'heilbronn',
  n_segments: 2,
  n_eligible: 1,
  min_points: 5,
  confidence_n: 30,
  danger_p95: 6.89,
  city_share_below_150: 0.41,
  safety_prior_k: 10,
  danger_min_length_m: 50,
  default_weights: { safety: 0.35, danger: 0.25, surface: 0.15, air: 0.15, flow: 0.1 },
  bbox: [9.17, 49.11, 9.25, 49.17] as [number, number, number, number],
};

const mockGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[9.2, 49.1]] },
      properties: {
        id: 'seg_001',
        osm_id: null,
        name: 'Street A',
        length_m: 100,
        n_points: 30,
        n_overtakes: 10,
        share_below_150: 0.5,
        avg_overtake_cm: 140,
        danger_per_100m: 3,
        mean_danger_risk: 0.5,
        mean_pm_risk: 0.4,
        roughness_norm: 0.3,
        traffic_flow: 0.7,
        avg_speed_kmh: 18,
        f_safety: 0.5,
        f_danger: 0.4,
        f_surface: 0.3,
        f_air: 0.4,
        f_flow: 0.3,
        missing: [],
        confidence: 1.0,
        eligible: true,
        score: 40,
        rank: 1,
        reason_texts: {},
      },
    },
  ],
};

describe('loadData', () => {
  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const u = url as string;
      if (u.includes('segments.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGeoJSON),
        } as Response);
      }
      if (u.includes('meta.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMeta),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches both files in parallel and returns segments + meta', async () => {
    const { segments, meta } = await loadData();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(meta.city).toBe('heilbronn');
    expect(segments.type).toBe('FeatureCollection');
    expect(segments.features).toHaveLength(1);
    expect(segments.features[0].properties.id).toBe('seg_001');
  });

  it('throws when a fetch fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response);
    await expect(loadData()).rejects.toThrow('Failed to load data');
  });

  it('returns features with correct geometry type', async () => {
    const { segments } = await loadData();
    expect(segments.features[0].geometry.type).toBe('LineString');
  });
});
