/* Jest manual mock for maplibre-gl — replaces the browser-only WebGL library in tests. */

const mockPopupInstance = {
  setLngLat: jest.fn().mockReturnThis(),
  setHTML: jest.fn().mockReturnThis(),
  setDOMContent: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn(),
};

const mockMapInstance = {
  on: jest.fn(),
  remove: jest.fn(),
  isStyleLoaded: jest.fn(() => false),
  addSource: jest.fn(),
  addLayer: jest.fn(),
  addControl: jest.fn(),
  getSource: jest.fn(),
  fitBounds: jest.fn(),
  setFilter: jest.fn(),
  flyTo: jest.fn(),
  getCanvas: jest.fn(() => ({ style: { cursor: '' } })),
};

export const Map = jest.fn(() => mockMapInstance);
export const Popup = jest.fn(() => mockPopupInstance);
export const NavigationControl = jest.fn();
export const setWorkerUrl = jest.fn();

// maplibre-gl v6 has no default export; the app uses `import * as maplibregl from 'maplibre-gl'`.

// Expose instances for assertions in tests
export { mockMapInstance, mockPopupInstance };
