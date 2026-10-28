// Loads public/data/segments.geojson + meta.json.
import type { Meta, SegmentProps } from './types';

export type SegmentFeature = GeoJSON.Feature<GeoJSON.LineString, SegmentProps>;
export type SegmentCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, SegmentProps>;

/** data/counters.geojson (pipeline/safelane/counters.py); context layer, not part of the contract. */
export interface CounterProps {
  id: string; name: string; avg_daily_bikes: number; n_days: number; last_date: string;
  source: string; licence: string;
}
export type CounterCollection = GeoJSON.FeatureCollection<GeoJSON.Point, CounterProps>;

// Set by next.config.mjs when public/data/counters.geojson exists, so a missing file is never requested.
const HAS_COUNTERS = process.env.NEXT_PUBLIC_HAS_COUNTERS === '1';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load data: ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadData(): Promise<{ segments: SegmentCollection; meta: Meta }> {
  const [segments, meta] = await Promise.all([
    fetchJson<SegmentCollection>('/data/segments.geojson'),
    fetchJson<Meta>('/data/meta.json'),
  ]);
  return { segments, meta };
}

/** Bike counters, or null when the file was not published or fails to load (the layer is optional). */
export async function loadCounters(): Promise<CounterCollection | null> {
  if (!HAS_COUNTERS) return null;
  try {
    const res = await fetch('/data/counters.geojson', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as CounterCollection) : null;
  } catch {
    return null;
  }
}
