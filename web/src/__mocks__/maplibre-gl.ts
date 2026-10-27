/* Jest manual mock for maplibre-gl — replaces the browser-only WebGL library in tests. */

const mockPopupInstance = {
  setLngLat: jest.fn().mockReturnThis(),
  setHTML: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn(),
};

const mockMapInstance = {
  on: jest.fn(),
  remove: jest.fn(),
  isStyleLoaded: jest.fn(() => false),
  addSource: jest.fn(),
  addLayer: jest.fn(),
  setFilter: jest.fn(),
  flyTo: jest.fn(),
  getCanvas: jest.fn(() => ({ style: { cursor: '' } })),
};

export const Map = jest.fn(() => mockMapInstance);
export const Popup = jest.fn(() => mockPopupInstance);

// Default export mirrors the real `import maplibregl from 'maplibre-gl'` usage
const maplibregl = { Map, Popup };
export default maplibregl;

// Expose instances for assertions in tests
export { mockMapInstance, mockPopupInstance };
