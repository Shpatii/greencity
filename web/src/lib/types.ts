export type FactorKey = 'safety' | 'danger' | 'surface' | 'air' | 'flow';
export type Weights = Record<FactorKey, number>;

export interface SegmentProps {
  id: string; osm_id: string | null; name: string | null; length_m: number;
  n_points: number; n_overtakes: number;
  share_below_150: number | null; avg_overtake_cm: number | null;
  danger_per_100m: number | null; mean_danger_risk: number | null;
  mean_pm_risk: number | null; roughness_norm: number | null;
  traffic_flow: number | null; avg_speed_kmh: number | null;
  f_safety: number; f_danger: number; f_surface: number; f_air: number; f_flow: number;
  missing: FactorKey[]; confidence: number; eligible: boolean;
  score: number | null; rank: number | null;
  reason_texts: Partial<Record<FactorKey, string>>;
}

export interface Meta {
  version: string; source: 'atrai'; generated_at: string; city: string;
  n_segments: number; n_eligible: number; min_points: number; confidence_n: number;
  danger_p95: number; city_share_below_150: number; safety_prior_k: number;
  danger_min_length_m: number; default_weights: Weights; bbox: [number, number, number, number];
}
