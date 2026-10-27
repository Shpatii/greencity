import { segmentLabel, osmWayUrl } from '@/lib/segmentLabel';

describe('segmentLabel', () => {
  it('uses the street name when present', () => {
    expect(segmentLabel({ id: 'seg_000123', name: 'Allee' })).toBe('Allee');
  });

  it('falls back to "Unnamed street" + the first 3 digits of the id', () => {
    expect(segmentLabel({ id: 'seg_004567', name: null })).toBe('Unnamed street 004');
  });

  it('omits the digits when the id has none', () => {
    expect(segmentLabel({ id: 'seg_x', name: null })).toBe('Unnamed street');
  });
});

describe('osmWayUrl', () => {
  it('builds the way URL', () => {
    expect(osmWayUrl('23456789')).toBe('https://www.openstreetmap.org/way/23456789');
  });

  it('uses the first id of a comma-separated list', () => {
    expect(osmWayUrl('111,222,333')).toBe('https://www.openstreetmap.org/way/111');
  });

  it('returns null without an id', () => {
    expect(osmWayUrl(null)).toBeNull();
    expect(osmWayUrl('')).toBeNull();
  });
});
