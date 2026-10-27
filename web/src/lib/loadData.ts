// Loads public/data/segments.geojson + meta.json.
import type { Meta, SegmentProps } from './types';

export type SegmentCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, SegmentProps>;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function loadData(): Promise<{ segments: SegmentCollection; meta: Meta }> {
  const [segments, meta] = await Promise.all([
    fetchJson<SegmentCollection>('/data/segments.geojson'),
    fetchJson<Meta>('/data/meta.json'),
  ]);
  return { segments, meta };
}
