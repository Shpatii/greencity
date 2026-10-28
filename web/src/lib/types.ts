export type FactorKey = 'safety' | 'danger' | 'surface' | 'air' | 'flow';
export type Weights = Record<FactorKey, number>;
export type InfraClass = 'separated' | 'bike_street' | 'painted_lane' | 'shared_bus' | 'shared' | 'none';
/** Why close passes and danger points do not count on a segment (CONTRACT 3.2, v1.2). */
export type PassesExcluded = 'car_free' | 'stationary' | 'short' | 'few_overtakes';

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
  // Contract 1.2; absent in older data.
  pass_severity?: number | null; passes_excluded?: PassesExcluded | null;
  // Contract 3.2b (OSM); absent in older data.
  highway?: string | null; maxspeed_kmh?: number | null; lanes?: number | null;
  infra_class?: InfraClass | null; infra_gap?: boolean; suggested_measure?: string | null;
}

export interface Meta {
  version: string; source: 'atrai'; generated_at: string; city: string;
  n_segments: number; n_eligible: number; min_points: number; confidence_n: number;
  danger_p95: number; city_share_below_150: number; safety_prior_k: number;
  danger_min_length_m: number; default_weights: Weights; bbox: [number, number, number, number];
  osm_fetched_at?: string | null; attribution?: string;
  // Contract 1.2; absent in older data.
  severity_weights?: number[]; car_free_highways?: string[]; stationary_speed_kmh?: number;
  min_pass_length_m?: number; min_overtakes?: number; city_pass_severity?: number;
}
