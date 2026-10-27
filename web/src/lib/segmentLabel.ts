import type { SegmentProps } from './types';
import { copy } from '@/content/copy';

/** Street name, or "Unnamed street" + the first 3 digits of the id (seg_123456 -> "123"). */
export function segmentLabel(p: Pick<SegmentProps, 'id' | 'name'>): string {
  if (p.name) return p.name;
  const digits = p.id.replace(/\D/g, '').slice(0, 3);
  return digits ? `${copy.unnamedStreet} ${digits}` : copy.unnamedStreet;
}

/** openstreetmap.org link for the segment's way; first id if osm_id is comma-separated. */
export function osmWayUrl(osmId: string | null): string | null {
  const first = osmId?.split(',')[0].trim();
  return first ? `https://www.openstreetmap.org/way/${encodeURIComponent(first)}` : null;
}
