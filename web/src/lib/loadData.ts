import type { SegmentProps, Meta } from './types';

export type Coord = [number, number];

export interface SegmentFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: Coord[] };
  properties: SegmentProps;
}

export async function loadData(): Promise<{ segments: SegmentFeature[]; meta: Meta }> {
  const [geoRes, metaRes] = await Promise.all([
    fetch('/data/segments.geojson'),
    fetch('/data/meta.json'),
  ]);
  if (!geoRes.ok || !metaRes.ok) throw new Error('Failed to load data');
  const geo: { type: 'FeatureCollection'; features: SegmentFeature[] } = await geoRes.json();
  const meta: Meta = await metaRes.json();
  return { segments: geo.features, meta };
}
