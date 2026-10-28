import { render } from '@testing-library/react';
import * as maplibregl from 'maplibre-gl';
import MapView from '@/components/MapView';
import type { Meta } from '@/lib/types';

jest.mock('pmtiles', () => ({
  Protocol: jest.fn(() => ({ add: jest.fn(), tile: jest.fn() })),
  PMTiles: jest.fn(() => ({ getHeader: () => new Promise(() => {}) })),
}));
jest.mock('@protomaps/basemaps', () => ({ layers: () => [], namedFlavor: jest.fn() }));

test('updates and clears sidebar padding without recreating the map', () => {
  const props = {
    segments: [], ranking: [], meta: {} as Meta,
    selectedId: null, setSelectedId: jest.fn(),
  };
  const { rerender, unmount } = render(<MapView {...props} />);
  const map = jest.mocked(maplibregl.Map).mock.results[0].value;
  const desktop = { top: 60, right: 444, bottom: 16, left: 16 };

  rerender(<MapView {...props} inset={desktop} />);
  expect(map.setPadding).toHaveBeenLastCalledWith(desktop);
  rerender(<MapView {...props} />);
  expect(map.setPadding).toHaveBeenLastCalledWith({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(maplibregl.Map).toHaveBeenCalledTimes(1);
  unmount();
});
